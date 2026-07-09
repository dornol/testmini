import { and, eq, inArray } from 'drizzle-orm';
import { badRequest } from './errors';
import { db } from './db';
import { release, testCase, testCycle, testExecution, testPlan } from './db/schema';

export async function validateOptionalReleaseId(
	releaseId: number | null | undefined,
	projectId: number
): Promise<Response | null> {
	if (releaseId == null) return null;

	const existing = await db.query.release.findFirst({
		where: and(eq(release.id, releaseId), eq(release.projectId, projectId))
	});
	return existing ? null : badRequest('Release not found in this project');
}

export async function validateOptionalTestPlanId(
	testPlanId: number | null | undefined,
	projectId: number
): Promise<Response | null> {
	if (testPlanId == null) return null;

	const existing = await db.query.testPlan.findFirst({
		where: and(eq(testPlan.id, testPlanId), eq(testPlan.projectId, projectId))
	});
	return existing ? null : badRequest('Test plan not found in this project');
}

export async function validateOptionalTestCycleId(
	testCycleId: number | null | undefined,
	projectId: number
): Promise<Response | null> {
	if (testCycleId == null) return null;

	const existing = await db.query.testCycle.findFirst({
		where: and(eq(testCycle.id, testCycleId), eq(testCycle.projectId, projectId))
	});
	return existing ? null : badRequest('Test cycle not found in this project');
}

export async function validateOptionalTestCaseId(
	testCaseId: number | null | undefined,
	projectId: number
): Promise<Response | null> {
	if (testCaseId == null) return null;

	const existing = await db.query.testCase.findFirst({
		where: and(eq(testCase.id, testCaseId), eq(testCase.projectId, projectId))
	});
	return existing ? null : badRequest('Test case not found in this project');
}

export async function validateOptionalTestExecutionId(
	testExecutionId: number | null | undefined,
	projectId: number
): Promise<Response | null> {
	if (testExecutionId == null) return null;

	const existing = await db.query.testExecution.findFirst({
		where: eq(testExecution.id, testExecutionId),
		with: {
			testRun: {
				columns: { projectId: true }
			}
		}
	});
	return existing?.testRun?.projectId === projectId
		? null
		: badRequest('Test execution not found in this project');
}

export async function validateTestCaseIdsInProject(
	testCaseIds: number[],
	projectId: number
): Promise<Response | null> {
	if (testCaseIds.length === 0) return null;

	const validTestCases = await db
		.select({ id: testCase.id })
		.from(testCase)
		.where(and(inArray(testCase.id, testCaseIds), eq(testCase.projectId, projectId)));

	return validTestCases.length === testCaseIds.length
		? null
		: badRequest('Some test cases do not belong to this project');
}
