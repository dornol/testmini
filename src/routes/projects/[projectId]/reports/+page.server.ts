import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import {
	testRun,
	testExecution,
	testCaseVersion,
	testCase,
	testCaseAssignee,
	user
} from '$lib/server/db/schema';
import { eq, and, sql, desc, count, isNotNull } from 'drizzle-orm';

export const load: PageServerLoad = async ({ params, parent }) => {
	await parent();
	const projectId = Number(params.projectId);

	const [
		envStats,
		recentRuns,
		priorityStats,
		creatorStats,
		assigneeStats,
		dailyResults,
		executorStats,
		topFailingCases
	] = await Promise.all([
		// Pass rate by environment
		db
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
			.groupBy(testRun.environment),

		// Recent 10 completed runs with pass rate (for trend)
		db
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
			.where(and(eq(testRun.projectId, projectId), eq(testRun.status, 'COMPLETED')))
			.groupBy(testRun.id)
			.orderBy(desc(testRun.finishedAt))
			.limit(10),

		// Priority breakdown across all executions
		db
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
			.groupBy(testCaseVersion.priority),

		// Test cases by creator
		db
			.select({
				userId: user.id,
				userName: user.name,
				caseCount: count(testCase.id)
			})
			.from(testCase)
			.innerJoin(user, eq(testCase.createdBy, user.id))
			.where(eq(testCase.projectId, projectId))
			.groupBy(user.id, user.name)
			.orderBy(desc(count(testCase.id))),

		// Pass/fail rate by assignee
		db
			.select({
				userId: user.id,
				userName: user.name,
				assignedCount: count(sql`distinct ${testCaseAssignee.testCaseId}`),
				totalExecs: count(testExecution.id),
				passCount: sql<number>`count(case when ${testExecution.status} = 'PASS' then 1 end)`.as(
					'pass_count'
				),
				failCount: sql<number>`count(case when ${testExecution.status} = 'FAIL' then 1 end)`.as(
					'fail_count'
				)
			})
			.from(testCaseAssignee)
			.innerJoin(user, eq(testCaseAssignee.userId, user.id))
			.innerJoin(testCase, eq(testCaseAssignee.testCaseId, testCase.id))
			.innerJoin(testCaseVersion, eq(testCase.latestVersionId, testCaseVersion.id))
			.leftJoin(testExecution, eq(testExecution.testCaseVersionId, testCaseVersion.id))
			.leftJoin(testRun, eq(testExecution.testRunId, testRun.id))
			.where(eq(testCase.projectId, projectId))
			.groupBy(user.id, user.name)
			.orderBy(desc(count(sql`distinct ${testCaseAssignee.testCaseId}`))),

		// Daily test run results
		db
			.select({
				date: sql<string>`to_char(${testExecution.executedAt}, 'YYYY-MM-DD')`.as('date'),
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
			.from(testExecution)
			.innerJoin(testRun, eq(testExecution.testRunId, testRun.id))
			.where(and(eq(testRun.projectId, projectId), isNotNull(testExecution.executedAt)))
			.groupBy(sql`to_char(${testExecution.executedAt}, 'YYYY-MM-DD')`)
			.orderBy(sql`to_char(${testExecution.executedAt}, 'YYYY-MM-DD')`),

		// Activity by executor
		db
			.select({
				userId: user.id,
				userName: user.name,
				execCount: count(testExecution.id),
				passCount: sql<number>`count(case when ${testExecution.status} = 'PASS' then 1 end)`.as(
					'pass_count'
				),
				failCount: sql<number>`count(case when ${testExecution.status} = 'FAIL' then 1 end)`.as(
					'fail_count'
				)
			})
			.from(testExecution)
			.innerJoin(user, eq(testExecution.executedBy, user.id))
			.innerJoin(testRun, eq(testExecution.testRunId, testRun.id))
			.where(eq(testRun.projectId, projectId))
			.groupBy(user.id, user.name)
			.orderBy(desc(count(testExecution.id))),

		// Top 10 failing test cases
		db
			.select({
				testCaseId: testCase.id,
				testCaseKey: testCase.key,
				title: testCaseVersion.title,
				totalExecs: count(testExecution.id),
				failCount: sql<number>`count(case when ${testExecution.status} = 'FAIL' then 1 end)`.as(
					'fail_count'
				),
				passCount: sql<number>`count(case when ${testExecution.status} = 'PASS' then 1 end)`.as(
					'pass_count'
				)
			})
			.from(testExecution)
			.innerJoin(testCaseVersion, eq(testExecution.testCaseVersionId, testCaseVersion.id))
			.innerJoin(testCase, eq(testCaseVersion.testCaseId, testCase.id))
			.innerJoin(testRun, eq(testExecution.testRunId, testRun.id))
			.where(eq(testRun.projectId, projectId))
			.groupBy(testCase.id, testCase.key, testCaseVersion.title)
			.having(
				sql`count(case when ${testExecution.status} = 'FAIL' then 1 end) > 0`
			)
			.orderBy(desc(sql`count(case when ${testExecution.status} = 'FAIL' then 1 end)`))
			.limit(10)
	]);

	return {
		envStats,
		recentRuns: recentRuns.reverse(),
		priorityStats,
		creatorStats,
		assigneeStats,
		dailyResults,
		executorStats,
		topFailingCases
	};
};
