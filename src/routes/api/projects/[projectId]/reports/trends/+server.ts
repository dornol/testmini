import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { testRun, testExecution, testCase, testCaseVersion } from '$lib/server/db/schema';
import { eq, and, desc, sql, count } from 'drizzle-orm';
import { withProjectAccess } from '$lib/server/api-handler';

/**
 * GET /api/projects/:projectId/reports/trends
 *
 * Returns:
 * - failureTrend: per-run failure counts for the last 20 completed runs
 * - flakyTests: test cases that alternate PASS/FAIL in recent runs
 */
export const GET = withProjectAccess(async ({ projectId }) => {
	// ── Failure Trend (last 20 completed runs) ──────────
	const failureTrend = await db
		.select({
			runId: testRun.id,
			runName: testRun.name,
			environment: testRun.environment,
			finishedAt: testRun.finishedAt,
			totalCount: sql<number>`count(${testExecution.id})`.as('total_count'),
			passCount: sql<number>`count(case when ${testExecution.status} = 'PASS' then 1 end)`.as('pass_count'),
			failCount: sql<number>`count(case when ${testExecution.status} = 'FAIL' then 1 end)`.as('fail_count'),
			blockedCount: sql<number>`count(case when ${testExecution.status} = 'BLOCKED' then 1 end)`.as('blocked_count'),
			skippedCount: sql<number>`count(case when ${testExecution.status} = 'SKIPPED' then 1 end)`.as('skipped_count')
		})
		.from(testRun)
		.leftJoin(testExecution, eq(testRun.id, testExecution.testRunId))
		.where(and(eq(testRun.projectId, projectId), eq(testRun.status, 'COMPLETED')))
		.groupBy(testRun.id)
		.orderBy(desc(testRun.finishedAt))
		.limit(20);

	// ── Flaky Tests (last 5 completed runs) ─────────────
	// A test is flaky if it has both PASS and FAIL results across recent runs
	const recentRunIds = failureTrend.slice(0, 5).map((r) => r.runId);

	let flakyTests: Array<{
		testCaseId: number;
		testCaseKey: string;
		testCaseTitle: string;
		passCount: number;
		failCount: number;
		totalRuns: number;
	}> = [];

	if (recentRunIds.length >= 2) {
		const results = await db
			.select({
				testCaseId: testCase.id,
				testCaseKey: testCase.key,
				testCaseTitle: testCaseVersion.title,
				passCount: sql<number>`count(case when ${testExecution.status} = 'PASS' then 1 end)`.as('pass_count'),
				failCount: sql<number>`count(case when ${testExecution.status} = 'FAIL' then 1 end)`.as('fail_count'),
				totalRuns: count(testExecution.id).as('total_runs')
			})
			.from(testExecution)
			.innerJoin(testCaseVersion, eq(testExecution.testCaseVersionId, testCaseVersion.id))
			.innerJoin(testCase, eq(testCaseVersion.testCaseId, testCase.id))
			.where(
				and(
					sql`${testExecution.testRunId} IN (${sql.join(recentRunIds.map((id) => sql`${id}`), sql`, `)})`,
					sql`${testExecution.status} IN ('PASS', 'FAIL')`
				)
			)
			.groupBy(testCase.id, testCase.key, testCaseVersion.title)
			.having(
				sql`count(case when ${testExecution.status} = 'PASS' then 1 end) > 0 AND count(case when ${testExecution.status} = 'FAIL' then 1 end) > 0`
			)
			.orderBy(sql`count(case when ${testExecution.status} = 'FAIL' then 1 end) desc`)
			.limit(20);

		flakyTests = results;
	}

	return json({
		failureTrend: failureTrend.reverse(),
		flakyTests
	});
});
