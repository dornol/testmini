import { and, eq } from 'drizzle-orm';
import { badRequest } from './errors';
import { db } from './db';
import { release, testCycle, testPlan } from './db/schema';

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
