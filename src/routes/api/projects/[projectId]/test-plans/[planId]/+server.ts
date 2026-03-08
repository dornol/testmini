import { json, error } from '@sveltejs/kit';
import { badRequest, validationError } from '$lib/server/errors';
import { db } from '$lib/server/db';
import { testPlan, testPlanTestCase, testCase, testCaseVersion, testRun, user } from '$lib/server/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { parseJsonBody } from '$lib/server/auth-utils';
import { withProjectAccess, withProjectRole } from '$lib/server/api-handler';
import { updateTestPlanSchema } from '$lib/schemas/test-plan.schema';

export const GET = withProjectAccess(async ({ params, projectId }) => {
	const planId = Number(params.planId);

	const plan = await db.query.testPlan.findFirst({
		where: and(eq(testPlan.id, planId), eq(testPlan.projectId, projectId))
	});

	if (!plan) {
		error(404, 'Plan not found');
	}

	// Get creator name
	const [creator] = await db
		.select({ name: user.name })
		.from(user)
		.where(eq(user.id, plan.createdBy));

	// Get items with test case info
	const items = await db
		.select({
			id: testPlanTestCase.id,
			testCaseId: testCase.id,
			key: testCase.key,
			title: testCaseVersion.title,
			priority: testCaseVersion.priority,
			position: testPlanTestCase.position
		})
		.from(testPlanTestCase)
		.innerJoin(testCase, eq(testPlanTestCase.testCaseId, testCase.id))
		.innerJoin(testCaseVersion, eq(testCase.latestVersionId, testCaseVersion.id))
		.where(eq(testPlanTestCase.testPlanId, planId))
		.orderBy(testPlanTestCase.position);

	// Get linked runs
	const runs = await db
		.select({
			id: testRun.id,
			name: testRun.name,
			status: testRun.status,
			environment: testRun.environment,
			createdAt: testRun.createdAt
		})
		.from(testRun)
		.where(eq(testRun.testPlanId, planId))
		.orderBy(testRun.createdAt);

	return json({
		...plan,
		createdByName: creator?.name ?? '',
		items,
		runs
	});
});

export const PATCH = withProjectRole(['PROJECT_ADMIN', 'QA', 'DEV'], async ({ request, params, projectId }) => {
	const planId = Number(params.planId);

	const plan = await db.query.testPlan.findFirst({
		where: and(eq(testPlan.id, planId), eq(testPlan.projectId, projectId))
	});

	if (!plan) {
		error(404, 'Plan not found');
	}

	const body = await parseJsonBody(request);
	const parsed = updateTestPlanSchema.safeParse(body);
	if (!parsed.success) {
		return validationError('Invalid input', parsed.error.flatten().fieldErrors);
	}

	const updates: Record<string, unknown> = {};
	if (parsed.data.name !== undefined) updates.name = parsed.data.name;
	if (parsed.data.description !== undefined) updates.description = parsed.data.description;
	if (parsed.data.status !== undefined) updates.status = parsed.data.status;
	if (parsed.data.milestone !== undefined) updates.milestone = parsed.data.milestone;
	if (parsed.data.startDate !== undefined) updates.startDate = parsed.data.startDate ? new Date(parsed.data.startDate) : null;
	if (parsed.data.endDate !== undefined) updates.endDate = parsed.data.endDate ? new Date(parsed.data.endDate) : null;

	if (Object.keys(updates).length === 0) {
		return badRequest('No fields to update');
	}

	await db
		.update(testPlan)
		.set(updates)
		.where(and(eq(testPlan.id, planId), eq(testPlan.projectId, projectId)));

	const updated = await db.query.testPlan.findFirst({
		where: and(eq(testPlan.id, planId), eq(testPlan.projectId, projectId))
	});

	return json(updated);
});

export const DELETE = withProjectRole(['PROJECT_ADMIN'], async ({ params, projectId }) => {
	const planId = Number(params.planId);

	const plan = await db.query.testPlan.findFirst({
		where: and(eq(testPlan.id, planId), eq(testPlan.projectId, projectId))
	});

	if (!plan) {
		error(404, 'Plan not found');
	}

	await db.delete(testPlan).where(and(eq(testPlan.id, planId), eq(testPlan.projectId, projectId)));

	return json({ success: true });
});
