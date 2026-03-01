import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { testCase, testRun, testExecution, user } from '$lib/server/db/schema';
import { eq, and, sql, desc, count } from 'drizzle-orm';

export const load: PageServerLoad = async ({ params }) => {
	const projectId = Number(params.projectId);

	// Test case count
	const [caseCount] = await db
		.select({ count: count() })
		.from(testCase)
		.where(eq(testCase.projectId, projectId));

	// Test run counts by status
	const runStats = await db
		.select({
			status: testRun.status,
			count: count()
		})
		.from(testRun)
		.where(eq(testRun.projectId, projectId))
		.groupBy(testRun.status);

	const runCounts = {
		total: 0,
		created: 0,
		inProgress: 0,
		completed: 0
	};
	for (const r of runStats) {
		runCounts.total += r.count;
		if (r.status === 'CREATED') runCounts.created = r.count;
		else if (r.status === 'IN_PROGRESS') runCounts.inProgress = r.count;
		else if (r.status === 'COMPLETED') runCounts.completed = r.count;
	}

	// Overall execution pass rate (across all runs in project)
	const execStats = await db
		.select({
			status: testExecution.status,
			count: count()
		})
		.from(testExecution)
		.innerJoin(testRun, eq(testExecution.testRunId, testRun.id))
		.where(eq(testRun.projectId, projectId))
		.groupBy(testExecution.status);

	const execCounts = { total: 0, pass: 0, fail: 0, blocked: 0, skipped: 0, pending: 0 };
	for (const e of execStats) {
		execCounts.total += e.count;
		if (e.status === 'PASS') execCounts.pass = e.count;
		else if (e.status === 'FAIL') execCounts.fail = e.count;
		else if (e.status === 'BLOCKED') execCounts.blocked = e.count;
		else if (e.status === 'SKIPPED') execCounts.skipped = e.count;
		else if (e.status === 'PENDING') execCounts.pending = e.count;
	}

	// Recent 5 test runs with execution summary
	const recentRuns = await db
		.select({
			id: testRun.id,
			name: testRun.name,
			environment: testRun.environment,
			status: testRun.status,
			createdAt: testRun.createdAt,
			finishedAt: testRun.finishedAt,
			totalCount: sql<number>`count(${testExecution.id})`.as('total_count'),
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
		.groupBy(testRun.id)
		.orderBy(desc(testRun.createdAt))
		.limit(5);

	// Pass Rate Trend (last 10 completed runs)
	const trendRuns = await db
		.select({
			id: testRun.id,
			name: testRun.name,
			finishedAt: testRun.finishedAt,
			totalCount: sql<number>`count(${testExecution.id})`.as('total_count'),
			passCount: sql<number>`count(case when ${testExecution.status} = 'PASS' then 1 end)`.as(
				'pass_count'
			)
		})
		.from(testRun)
		.leftJoin(testExecution, eq(testRun.id, testExecution.testRunId))
		.where(and(eq(testRun.projectId, projectId), eq(testRun.status, 'COMPLETED')))
		.groupBy(testRun.id)
		.orderBy(desc(testRun.finishedAt))
		.limit(10);

	// Activity Log (last 20 execution changes)
	const activityLog = await db
		.select({
			id: testExecution.id,
			status: testExecution.status,
			executedBy: user.name,
			executedAt: testExecution.executedAt,
			testRunName: testRun.name
		})
		.from(testExecution)
		.innerJoin(testRun, eq(testExecution.testRunId, testRun.id))
		.leftJoin(user, eq(testExecution.executedBy, user.id))
		.where(
			and(eq(testRun.projectId, projectId), sql`${testExecution.executedAt} IS NOT NULL`)
		)
		.orderBy(desc(testExecution.executedAt))
		.limit(20);

	return {
		stats: {
			testCaseCount: caseCount.count,
			runCounts,
			execCounts
		},
		recentRuns,
		trendRuns: trendRuns.reverse(),
		activityLog
	};
};
