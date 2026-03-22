import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { testCase, testRun, testExecution } from '$lib/server/db/schema';
import { eq, and, count, sql } from 'drizzle-orm';

export function registerReportTools(server: McpServer, projectId: number) {
	server.tool(
		'get-project-stats',
		'Get overall project statistics (test case count, run count, execution counts by status, pass rate)',
		{},
		async () => {
			try {
				const tcCount = await db
					.select({ count: count() })
					.from(testCase)
					.where(eq(testCase.projectId, projectId));

				const runCount = await db
					.select({ count: count() })
					.from(testRun)
					.where(eq(testRun.projectId, projectId));

				const execCounts = await db
					.select({ status: testExecution.status, count: count() })
					.from(testExecution)
					.innerJoin(testRun, eq(testExecution.testRunId, testRun.id))
					.where(eq(testRun.projectId, projectId))
					.groupBy(testExecution.status);

				const executionCounts: Record<string, number> = {
					PASS: 0,
					FAIL: 0,
					BLOCKED: 0,
					SKIPPED: 0,
					PENDING: 0
				};
				let total = 0;
				for (const row of execCounts) {
					executionCounts[row.status] = row.count;
					total += row.count;
				}

				const passRate = total > 0 ? Math.round((executionCounts.PASS / total) * 10000) / 100 : 0;

				return {
					content: [
						{
							type: 'text' as const,
							text: JSON.stringify(
								{
									testCaseCount: tcCount[0].count,
									testRunCount: runCount[0].count,
									executionCounts,
									passRate
								},
								null,
								2
							)
						}
					]
				};
			} catch (e) {
				return {
					content: [{ type: 'text' as const, text: `Error: ${(e as Error).message}` }],
					isError: true
				};
			}
		}
	);

	server.tool(
		'get-trends',
		'Get pass rate trend from recent completed test runs (up to 20)',
		{
			limit: z.number().optional().describe('Number of recent runs to include (default: 20, max: 50)')
		},
		async ({ limit }) => {
			try {
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
					.orderBy(sql`${testRun.createdAt} desc`)
					.limit(maxRuns);

				const trends = [];
				for (const run of runs) {
					const statusCounts = await db
						.select({ status: testExecution.status, count: count() })
						.from(testExecution)
						.where(eq(testExecution.testRunId, run.id))
						.groupBy(testExecution.status);

					let passCount = 0;
					let failCount = 0;
					let totalCount = 0;
					for (const row of statusCounts) {
						totalCount += row.count;
						if (row.status === 'PASS') passCount = row.count;
						if (row.status === 'FAIL') failCount = row.count;
					}

					trends.push({
						runId: run.id,
						runName: run.name,
						environment: run.environment,
						passCount,
						failCount,
						totalCount,
						passRate: totalCount > 0 ? Math.round((passCount / totalCount) * 10000) / 100 : 0,
						finishedAt: run.finishedAt
					});
				}

				return {
					content: [{ type: 'text' as const, text: JSON.stringify(trends, null, 2) }]
				};
			} catch (e) {
				return {
					content: [{ type: 'text' as const, text: `Error: ${(e as Error).message}` }],
					isError: true
				};
			}
		}
	);
}
