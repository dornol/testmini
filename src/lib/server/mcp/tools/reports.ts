import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { testCase, testRun, testExecution } from '$lib/server/db/schema';
import { eq, and, count, sql, isNotNull, inArray, desc } from 'drizzle-orm';
import { ok } from '../helpers';

export function registerReportTools(server: McpServer, projectId: number) {
	server.tool(
		'get-project-stats',
		'Get overall project statistics (test case count, run count, execution counts by status, pass rate)',
		{},
		async () => {
			const [{ tcCount }] = await db
				.select({ tcCount: count() })
				.from(testCase)
				.where(eq(testCase.projectId, projectId));

			const [{ runCount }] = await db
				.select({ runCount: count() })
				.from(testRun)
				.where(eq(testRun.projectId, projectId));

			const execCounts = await db
				.select({ status: testExecution.status, count: count() })
				.from(testExecution)
				.innerJoin(testRun, eq(testExecution.testRunId, testRun.id))
				.where(eq(testRun.projectId, projectId))
				.groupBy(testExecution.status);

			const executionCounts: Record<string, number> = { PASS: 0, FAIL: 0, BLOCKED: 0, SKIPPED: 0, PENDING: 0 };
			let total = 0;
			for (const row of execCounts) {
				executionCounts[row.status] = row.count;
				total += row.count;
			}

			const passRate = total > 0 ? Math.round((executionCounts.PASS / total) * 10000) / 100 : 0;

			return ok({ testCaseCount: tcCount, testRunCount: runCount, executionCounts, passRate });
		}
	);

	server.tool(
		'get-trends',
		'Get pass rate trend from recent completed test runs (up to 20)',
		{
			limit: z.number().optional().describe('Number of recent runs to include (default: 20, max: 50)')
		},
		async ({ limit }) => {
			const maxRuns = Math.min(limit ?? 20, 50);

			const runs = await db
				.select({
					id: testRun.id,
					name: testRun.name,
					environment: testRun.environment,
					finishedAt: testRun.finishedAt
				})
				.from(testRun)
				.where(and(eq(testRun.projectId, projectId), eq(testRun.status, 'COMPLETED')))
				.orderBy(desc(testRun.createdAt))
				.limit(maxRuns);

			if (runs.length === 0) return ok([]);

			// Single query for all run execution counts (fixes N+1)
			const runIds = runs.map((r) => r.id);
			const allExecCounts = await db
				.select({
					testRunId: testExecution.testRunId,
					status: testExecution.status,
					count: count()
				})
				.from(testExecution)
				.where(inArray(testExecution.testRunId, runIds))
				.groupBy(testExecution.testRunId, testExecution.status);

			const runStatsMap = new Map<number, { pass: number; fail: number; total: number }>();
			for (const row of allExecCounts) {
				const stats = runStatsMap.get(row.testRunId) ?? { pass: 0, fail: 0, total: 0 };
				stats.total += row.count;
				if (row.status === 'PASS') stats.pass += row.count;
				if (row.status === 'FAIL') stats.fail += row.count;
				runStatsMap.set(row.testRunId, stats);
			}

			const trends = runs.map((run) => {
				const stats = runStatsMap.get(run.id) ?? { pass: 0, fail: 0, total: 0 };
				return {
					runId: run.id,
					runName: run.name,
					environment: run.environment,
					passCount: stats.pass,
					failCount: stats.fail,
					totalCount: stats.total,
					passRate: stats.total > 0 ? Math.round((stats.pass / stats.total) * 10000) / 100 : 0,
					finishedAt: run.finishedAt
				};
			});

			return ok(trends);
		}
	);

	server.tool(
		'get-risk-matrix',
		'Get risk assessment matrix showing test cases grouped by risk impact and likelihood',
		{},
		async () => {
			const rows = await db
				.select({
					riskImpact: testCase.riskImpact,
					riskLikelihood: testCase.riskLikelihood,
					riskLevel: testCase.riskLevel,
					count: sql<number>`count(*)::int`
				})
				.from(testCase)
				.where(and(eq(testCase.projectId, projectId), isNotNull(testCase.riskLevel)))
				.groupBy(testCase.riskImpact, testCase.riskLikelihood, testCase.riskLevel);

			const [totals] = await db
				.select({
					total: sql<number>`count(*)::int`,
					assessed: sql<number>`count(${testCase.riskLevel})::int`
				})
				.from(testCase)
				.where(eq(testCase.projectId, projectId));

			return ok({
				matrix: rows,
				total: totals?.total ?? 0,
				assessed: totals?.assessed ?? 0,
				unassessed: (totals?.total ?? 0) - (totals?.assessed ?? 0)
			});
		}
	);
}
