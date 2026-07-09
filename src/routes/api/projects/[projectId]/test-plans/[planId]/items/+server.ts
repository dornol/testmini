import { json, error } from '@sveltejs/kit';
import { badRequest } from '$lib/server/errors';
import { db } from '$lib/server/db';
import { testPlan, testPlanTestCase, testCase } from '$lib/server/db/schema';
import { eq, and, inArray, sql } from 'drizzle-orm';
import { parseJsonBody, parseId } from '$lib/server/auth-utils';
import { withProjectRole } from '$lib/server/api-handler';
import { validatePositiveIntegerList, validateRequestBody } from '$lib/server/id-list-validation';

export const POST = withProjectRole(
	['PROJECT_ADMIN', 'QA', 'DEV'],
	async ({ request, params, projectId }) => {
		const planId = parseId(params.planId, 'plan ID');

		const plan = await db.query.testPlan.findFirst({
			where: and(eq(testPlan.id, planId), eq(testPlan.projectId, projectId))
		});

		if (!plan) {
			error(404, 'Plan not found');
		}

		const bodyOrError = validateRequestBody(await parseJsonBody(request));
		if (bodyOrError instanceof Response) return bodyOrError;

		const testCaseIds = validatePositiveIntegerList(bodyOrError.testCaseIds, 'testCaseIds');
		if (testCaseIds instanceof Response) return testCaseIds;

		// Validate all test cases belong to the same project
		const validTestCases = await db
			.select({ id: testCase.id })
			.from(testCase)
			.where(and(inArray(testCase.id, testCaseIds), eq(testCase.projectId, projectId)));
		if (validTestCases.length !== testCaseIds.length) {
			return badRequest('Some test cases do not belong to this project');
		}

		// Get max position
		const [maxPos] = await db
			.select({ maxPosition: sql<number>`coalesce(max(${testPlanTestCase.position}), -1)` })
			.from(testPlanTestCase)
			.where(eq(testPlanTestCase.testPlanId, planId));

		let nextPosition = (maxPos?.maxPosition ?? -1) + 1;

		const values = testCaseIds.map((tcId) => ({
			testPlanId: planId,
			testCaseId: tcId,
			position: nextPosition++
		}));
		const inserted = await db
			.insert(testPlanTestCase)
			.values(values)
			.onConflictDoNothing()
			.returning({ id: testPlanTestCase.id });

		return json({ success: true, added: inserted.length });
	}
);

export const DELETE = withProjectRole(
	['PROJECT_ADMIN', 'QA', 'DEV'],
	async ({ request, params, projectId }) => {
		const planId = parseId(params.planId, 'plan ID');

		const plan = await db.query.testPlan.findFirst({
			where: and(eq(testPlan.id, planId), eq(testPlan.projectId, projectId))
		});

		if (!plan) {
			error(404, 'Plan not found');
		}

		const bodyOrError = validateRequestBody(await parseJsonBody(request));
		if (bodyOrError instanceof Response) return bodyOrError;

		const testCaseIds = validatePositiveIntegerList(bodyOrError.testCaseIds, 'testCaseIds');
		if (testCaseIds instanceof Response) return testCaseIds;

		const deleted = await db
			.delete(testPlanTestCase)
			.where(
				and(
					eq(testPlanTestCase.testPlanId, planId),
					inArray(testPlanTestCase.testCaseId, testCaseIds)
				)
			)
			.returning({ id: testPlanTestCase.id });

		return json({ success: true, removed: deleted.length });
	}
);
