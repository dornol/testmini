import { json, error } from '@sveltejs/kit';
import { badRequest, validationError } from '$lib/server/errors';
import { db } from '$lib/server/db';
import { testPlan, testPlanTestCase, testCase } from '$lib/server/db/schema';
import { eq, and, inArray, sql } from 'drizzle-orm';
import { parseJsonBody } from '$lib/server/auth-utils';
import { withProjectRole } from '$lib/server/api-handler';
import { z } from 'zod';

const itemsSchema = z.object({
	testCaseIds: z.array(z.number().int().positive()).min(1, 'At least one test case ID is required')
});

export const POST = withProjectRole(['PROJECT_ADMIN', 'QA', 'DEV'], async ({ request, params, projectId }) => {
	const planId = Number(params.planId);

	const plan = await db.query.testPlan.findFirst({
		where: and(eq(testPlan.id, planId), eq(testPlan.projectId, projectId))
	});

	if (!plan) {
		error(404, 'Plan not found');
	}

	const body = await parseJsonBody(request);
	const parsed = itemsSchema.safeParse(body);
	if (!parsed.success) {
		return validationError('Invalid input', parsed.error.flatten().fieldErrors);
	}

	// Validate all test cases belong to the same project
	const validTestCases = await db
		.select({ id: testCase.id })
		.from(testCase)
		.where(and(inArray(testCase.id, parsed.data.testCaseIds), eq(testCase.projectId, projectId)));
	if (validTestCases.length !== parsed.data.testCaseIds.length) {
		return badRequest('Some test cases do not belong to this project');
	}

	// Get max position
	const [maxPos] = await db
		.select({ maxPosition: sql<number>`coalesce(max(${testPlanTestCase.position}), -1)` })
		.from(testPlanTestCase)
		.where(eq(testPlanTestCase.testPlanId, planId));

	let nextPosition = (maxPos?.maxPosition ?? -1) + 1;

	// Insert with conflict handling (skip duplicates)
	for (const tcId of parsed.data.testCaseIds) {
		try {
			await db.insert(testPlanTestCase).values({
				testPlanId: planId,
				testCaseId: tcId,
				position: nextPosition++
			});
		} catch {
			// ignore duplicate constraint violations
		}
	}

	return json({ success: true });
});

export const DELETE = withProjectRole(['PROJECT_ADMIN', 'QA', 'DEV'], async ({ request, params, projectId }) => {
	const planId = Number(params.planId);

	const plan = await db.query.testPlan.findFirst({
		where: and(eq(testPlan.id, planId), eq(testPlan.projectId, projectId))
	});

	if (!plan) {
		error(404, 'Plan not found');
	}

	const body = await parseJsonBody(request);
	const parsed = itemsSchema.safeParse(body);
	if (!parsed.success) {
		return validationError('Invalid input', parsed.error.flatten().fieldErrors);
	}

	await db
		.delete(testPlanTestCase)
		.where(
			and(
				eq(testPlanTestCase.testPlanId, planId),
				inArray(testPlanTestCase.testCaseId, parsed.data.testCaseIds)
			)
		);

	return json({ success: true });
});
