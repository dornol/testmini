import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { testPlan, testPlanSignoff, user, projectMember } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { parseJsonBody } from '$lib/server/auth-utils';
import { withProjectAccess, withProjectRole } from '$lib/server/api-handler';
import { createSignoffSchema } from '$lib/schemas/signoff.schema';
import { notFound, validationError } from '$lib/server/errors';
import { createNotification } from '$lib/server/notifications';

export const GET = withProjectAccess(async ({ params, projectId }) => {
	const planId = Number(params.planId);
	if (!Number.isFinite(planId)) error(400, 'Invalid plan ID');

	const plan = await db.query.testPlan.findFirst({
		where: and(eq(testPlan.id, planId), eq(testPlan.projectId, projectId))
	});
	if (!plan) return notFound('Plan not found');

	const signoffs = await db
		.select({
			id: testPlanSignoff.id,
			decision: testPlanSignoff.decision,
			comment: testPlanSignoff.comment,
			createdAt: testPlanSignoff.createdAt,
			userId: testPlanSignoff.userId,
			userName: user.name
		})
		.from(testPlanSignoff)
		.innerJoin(user, eq(testPlanSignoff.userId, user.id))
		.where(eq(testPlanSignoff.testPlanId, planId))
		.orderBy(testPlanSignoff.createdAt);

	return json(signoffs);
});

export const POST = withProjectRole(
	['PROJECT_ADMIN', 'QA'],
	async ({ request, params, projectId, user: currentUser }) => {
		const planId = Number(params.planId);
		if (!Number.isFinite(planId)) error(400, 'Invalid plan ID');

		const plan = await db.query.testPlan.findFirst({
			where: and(eq(testPlan.id, planId), eq(testPlan.projectId, projectId))
		});
		if (!plan) return notFound('Plan not found');

		const body = await parseJsonBody(request);
		const parsed = createSignoffSchema.safeParse(body);
		if (!parsed.success) {
			return validationError('Invalid input', parsed.error.flatten().fieldErrors);
		}

		const [signoff] = await db
			.insert(testPlanSignoff)
			.values({
				testPlanId: planId,
				userId: currentUser.id,
				decision: parsed.data.decision,
				comment: parsed.data.comment ?? null
			})
			.returning();

		// Notify plan creator
		if (plan.createdBy !== currentUser.id) {
			createNotification({
				userId: plan.createdBy,
				type: 'SIGNOFF_SUBMITTED',
				title: `Sign-off: ${parsed.data.decision}`,
				message: `${currentUser.name} ${parsed.data.decision === 'APPROVED' ? 'approved' : 'rejected'} plan "${plan.name}"`,
				link: `/projects/${projectId}/test-plans/${planId}`,
				projectId
			});
		}

		// Notify all project admins
		const admins = await db
			.select({ userId: projectMember.userId })
			.from(projectMember)
			.where(and(eq(projectMember.projectId, projectId), eq(projectMember.role, 'PROJECT_ADMIN')));

		for (const admin of admins) {
			if (admin.userId !== currentUser.id && admin.userId !== plan.createdBy) {
				createNotification({
					userId: admin.userId,
					type: 'SIGNOFF_SUBMITTED',
					title: `Sign-off: ${parsed.data.decision}`,
					message: `${currentUser.name} ${parsed.data.decision === 'APPROVED' ? 'approved' : 'rejected'} plan "${plan.name}"`,
					link: `/projects/${projectId}/test-plans/${planId}`,
					projectId
				});
			}
		}

		return json(signoff, { status: 201 });
	}
);
