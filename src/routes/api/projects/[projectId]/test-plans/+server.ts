import { json } from '@sveltejs/kit';
import { validationError } from '$lib/server/errors';
import { db } from '$lib/server/db';
import { testPlan, testPlanTestCase, testRun, user } from '$lib/server/db/schema';
import { eq, sql } from 'drizzle-orm';
import { parseJsonBody } from '$lib/server/auth-utils';
import { withProjectAccess, withProjectRole } from '$lib/server/api-handler';
import { createTestPlanSchema } from '$lib/schemas/test-plan.schema';

export const GET = withProjectAccess(async ({ projectId, url }) => {
	const statusFilter = url.searchParams.get('status');

	let query = db
		.select({
			id: testPlan.id,
			name: testPlan.name,
			description: testPlan.description,
			status: testPlan.status,
			milestone: testPlan.milestone,
			startDate: testPlan.startDate,
			endDate: testPlan.endDate,
			createdBy: user.name,
			createdAt: testPlan.createdAt,
			itemCount: sql<number>`(select count(*) from test_plan_test_case where test_plan_id = ${testPlan.id})`.as('item_count'),
			runCount: sql<number>`(select count(*) from test_run where test_plan_id = ${testPlan.id})`.as('run_count')
		})
		.from(testPlan)
		.innerJoin(user, eq(testPlan.createdBy, user.id))
		.where(eq(testPlan.projectId, projectId))
		.orderBy(testPlan.createdAt)
		.$dynamic();

	const validStatuses = ['DRAFT', 'IN_REVIEW', 'APPROVED', 'ACTIVE', 'COMPLETED', 'ARCHIVED'] as const;
	type TestPlanStatus = typeof validStatuses[number];
	if (statusFilter && validStatuses.includes(statusFilter as TestPlanStatus)) {
		query = query.where(eq(testPlan.status, statusFilter as TestPlanStatus));
	}

	const plans = await db
		.select({
			id: testPlan.id,
			name: testPlan.name,
			description: testPlan.description,
			status: testPlan.status,
			milestone: testPlan.milestone,
			startDate: testPlan.startDate,
			endDate: testPlan.endDate,
			createdBy: user.name,
			createdAt: testPlan.createdAt,
			itemCount: sql<number>`(select count(*) from test_plan_test_case where test_plan_id = ${testPlan.id})`.as('item_count'),
			runCount: sql<number>`(select count(*) from test_run where test_plan_id = ${testPlan.id})`.as('run_count')
		})
		.from(testPlan)
		.innerJoin(user, eq(testPlan.createdBy, user.id))
		.where(
			statusFilter
				? sql`${testPlan.projectId} = ${projectId} AND ${testPlan.status} = ${statusFilter}`
				: eq(testPlan.projectId, projectId)
		)
		.orderBy(testPlan.createdAt);

	return json(plans);
});

export const POST = withProjectRole(['PROJECT_ADMIN', 'QA', 'DEV'], async ({ request, user: authUser, projectId }) => {
	const body = await parseJsonBody(request);
	const parsed = createTestPlanSchema.safeParse(body);
	if (!parsed.success) {
		return validationError('Invalid input', parsed.error.flatten().fieldErrors);
	}

	const { name, description, milestone, startDate, endDate, testCaseIds } = parsed.data;

	const plan = await db.transaction(async (tx) => {
		const [created] = await tx
			.insert(testPlan)
			.values({
				projectId,
				name,
				description: description || null,
				milestone: milestone || null,
				startDate: startDate ? new Date(startDate) : null,
				endDate: endDate ? new Date(endDate) : null,
				createdBy: authUser.id
			})
			.returning();

		if (testCaseIds.length > 0) {
			await tx.insert(testPlanTestCase).values(
				testCaseIds.map((tcId, idx) => ({
					testPlanId: created.id,
					testCaseId: tcId,
					position: idx
				}))
			);
		}

		return created;
	});

	return json({ id: plan.id }, { status: 201 });
});
