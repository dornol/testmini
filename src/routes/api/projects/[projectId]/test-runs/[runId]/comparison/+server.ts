import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { testRun, testExecution, testCaseVersion, testCase } from '$lib/server/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { withProjectAccess } from '$lib/server/api-handler';
import { badRequest, notFound } from '$lib/server/errors';

export const GET = withProjectAccess(async ({ params, projectId }) => {
	const runId = Number(params.runId);
	if (!Number.isFinite(runId)) error(400, 'Invalid run ID');

	const run = await db.query.testRun.findFirst({
		where: and(eq(testRun.id, runId), eq(testRun.projectId, projectId))
	});
	if (!run) return notFound('Test run not found');
	if (!run.retestOfRunId) return badRequest('This run is not a retest run');

	// Load original run executions
	const originalExecs = await db
		.select({
			testCaseVersionId: testExecution.testCaseVersionId,
			status: testExecution.status,
			testCaseKey: testCase.key,
			title: testCaseVersion.title,
			priority: testCaseVersion.priority
		})
		.from(testExecution)
		.innerJoin(testCaseVersion, eq(testExecution.testCaseVersionId, testCaseVersion.id))
		.innerJoin(testCase, eq(testCaseVersion.testCaseId, testCase.id))
		.where(eq(testExecution.testRunId, run.retestOfRunId));

	// Load retest run executions
	const retestExecs = await db
		.select({
			testCaseVersionId: testExecution.testCaseVersionId,
			status: testExecution.status
		})
		.from(testExecution)
		.where(eq(testExecution.testRunId, runId));

	// Build comparison map
	const retestMap = new Map(retestExecs.map(e => [e.testCaseVersionId, e.status]));

	const comparisons = originalExecs
		.filter(e => retestMap.has(e.testCaseVersionId))
		.map(e => {
			const retestStatus = retestMap.get(e.testCaseVersionId)!;
			const wasFailing = e.status === 'FAIL' || e.status === 'BLOCKED';
			const nowPassing = retestStatus === 'PASS';
			return {
				testCaseKey: e.testCaseKey,
				title: e.title,
				priority: e.priority,
				originalStatus: e.status,
				retestStatus,
				improved: wasFailing && nowPassing
			};
		});

	const summary = {
		total: comparisons.length,
		improved: comparisons.filter(c => c.improved).length,
		regressed: comparisons.filter(c => {
			const wasOk = c.originalStatus === 'PASS';
			const nowBad = c.retestStatus === 'FAIL' || c.retestStatus === 'BLOCKED';
			return wasOk && nowBad;
		}).length,
		unchanged: comparisons.filter(c => c.originalStatus === c.retestStatus).length
	};

	return json({ originalRunId: run.retestOfRunId, retestRunId: runId, summary, comparisons });
});
