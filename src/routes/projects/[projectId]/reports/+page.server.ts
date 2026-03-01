import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { testRun, testExecution, testCaseVersion } from '$lib/server/db/schema';
import { eq, and, sql, desc, count } from 'drizzle-orm';

export const load: PageServerLoad = async ({ params, parent }) => {
	await parent();
	const projectId = Number(params.projectId);

	// Pass rate by environment
	const envStats = await db
		.select({
			environment: testRun.environment,
			totalRuns: count(testRun.id),
			totalExecs: sql<number>`count(${testExecution.id})`.as('total_execs'),
			passCount: sql<number>`count(case when ${testExecution.status} = 'PASS' then 1 end)`.as(
				'pass_count'
			),
			failCount: sql<number>`count(case when ${testExecution.status} = 'FAIL' then 1 end)`.as(
				'fail_count'
			)
		})
		.from(testRun)
		.leftJoin(testExecution, eq(testRun.id, testExecution.testRunId))
		.where(eq(testRun.projectId, projectId))
		.groupBy(testRun.environment);

	// Recent 10 completed runs with pass rate (for trend)
	const recentRuns = await db
		.select({
			id: testRun.id,
			name: testRun.name,
			environment: testRun.environment,
			status: testRun.status,
			finishedAt: testRun.finishedAt,
			createdAt: testRun.createdAt,
			totalCount: sql<number>`count(${testExecution.id})`.as('total_count'),
			passCount: sql<number>`count(case when ${testExecution.status} = 'PASS' then 1 end)`.as(
				'pass_count'
			),
			failCount: sql<number>`count(case when ${testExecution.status} = 'FAIL' then 1 end)`.as(
				'fail_count'
			),
			blockedCount: sql<number>`count(case when ${testExecution.status} = 'BLOCKED' then 1 end)`.as(
				'blocked_count'
			),
			skippedCount: sql<number>`count(case when ${testExecution.status} = 'SKIPPED' then 1 end)`.as(
				'skipped_count'
			)
		})
		.from(testRun)
		.leftJoin(testExecution, eq(testRun.id, testExecution.testRunId))
		.where(
			and(eq(testRun.projectId, projectId), eq(testRun.status, 'COMPLETED'))
		)
		.groupBy(testRun.id)
		.orderBy(desc(testRun.finishedAt))
		.limit(10);

	// Priority breakdown across all executions
	const priorityStats = await db
		.select({
			priority: testCaseVersion.priority,
			total: count(testExecution.id),
			passCount: sql<number>`count(case when ${testExecution.status} = 'PASS' then 1 end)`.as(
				'pass_count'
			),
			failCount: sql<number>`count(case when ${testExecution.status} = 'FAIL' then 1 end)`.as(
				'fail_count'
			)
		})
		.from(testExecution)
		.innerJoin(testCaseVersion, eq(testExecution.testCaseVersionId, testCaseVersion.id))
		.innerJoin(testRun, eq(testExecution.testRunId, testRun.id))
		.where(eq(testRun.projectId, projectId))
		.groupBy(testCaseVersion.priority);

	return {
		envStats,
		recentRuns: recentRuns.reverse(),
		priorityStats
	};
};
