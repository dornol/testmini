import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { testCycle, testRun, testExecution, user } from '$lib/server/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { withProjectAccess, withProjectRole } from '$lib/server/api-handler';
import { parseJsonBody } from '$lib/server/auth-utils';
import { updateTestCycleSchema } from '$lib/schemas/test-cycle.schema';
import { notFound, badRequest } from '$lib/server/errors';

export const GET = withProjectAccess(async ({ params, projectId }) => {
	const cycleId = Number(params.cycleId);
	if (!Number.isFinite(cycleId)) return badRequest('Invalid cycle ID');

	const [cycle] = await db
		.select({
			id: testCycle.id,
			name: testCycle.name,
			cycleNumber: testCycle.cycleNumber,
			status: testCycle.status,
			releaseId: testCycle.releaseId,
			startDate: testCycle.startDate,
			endDate: testCycle.endDate,
			createdBy: user.name,
			createdAt: testCycle.createdAt
		})
		.from(testCycle)
		.innerJoin(user, eq(testCycle.createdBy, user.id))
		.where(and(eq(testCycle.id, cycleId), eq(testCycle.projectId, projectId)));

	if (!cycle) return notFound('Test cycle not found');

	// Get linked runs with stats
	const runs = await db
		.select({
			id: testRun.id,
			name: testRun.name,
			environment: testRun.environment,
			status: testRun.status,
			createdAt: testRun.createdAt,
			total: sql<number>`count(${testExecution.id})::int`,
			passed: sql<number>`count(case when ${testExecution.status} = 'PASS' then 1 end)::int`,
			failed: sql<number>`count(case when ${testExecution.status} = 'FAIL' then 1 end)::int`
		})
		.from(testRun)
		.leftJoin(testExecution, eq(testExecution.testRunId, testRun.id))
		.where(eq(testRun.testCycleId, cycleId))
		.groupBy(testRun.id)
		.orderBy(testRun.createdAt);

	const totalTests = runs.reduce((s, r) => s + r.total, 0);
	const totalPassed = runs.reduce((s, r) => s + r.passed, 0);

	return json({
		...cycle,
		runs,
		summary: {
			runCount: runs.length,
			totalTests,
			totalPassed,
			passRate: totalTests > 0 ? Math.round((totalPassed / totalTests) * 100) : 0
		}
	});
});

export const PUT = withProjectRole(['PROJECT_ADMIN', 'QA'], async ({ request, params, projectId }) => {
	const cycleId = Number(params.cycleId);
	if (!Number.isFinite(cycleId)) return badRequest('Invalid cycle ID');

	const body = await parseJsonBody(request);
	const parsed = updateTestCycleSchema.safeParse(body);
	if (!parsed.success) return badRequest('Invalid input');

	const updates: Record<string, unknown> = {};
	if (parsed.data.name !== undefined) updates.name = parsed.data.name;
	if (parsed.data.status !== undefined) updates.status = parsed.data.status;
	if (parsed.data.releaseId !== undefined) updates.releaseId = parsed.data.releaseId;
	if (parsed.data.startDate !== undefined) updates.startDate = parsed.data.startDate ? new Date(parsed.data.startDate) : null;
	if (parsed.data.endDate !== undefined) updates.endDate = parsed.data.endDate ? new Date(parsed.data.endDate) : null;

	if (Object.keys(updates).length === 0) return badRequest('No fields to update');

	const [updated] = await db
		.update(testCycle)
		.set(updates)
		.where(and(eq(testCycle.id, cycleId), eq(testCycle.projectId, projectId)))
		.returning();

	if (!updated) return notFound('Test cycle not found');
	return json(updated);
});

export const DELETE = withProjectRole(['PROJECT_ADMIN'], async ({ params, projectId }) => {
	const cycleId = Number(params.cycleId);
	if (!Number.isFinite(cycleId)) return badRequest('Invalid cycle ID');

	const [deleted] = await db
		.delete(testCycle)
		.where(and(eq(testCycle.id, cycleId), eq(testCycle.projectId, projectId)))
		.returning({ id: testCycle.id });

	if (!deleted) return notFound('Test cycle not found');
	return json({ success: true });
});
