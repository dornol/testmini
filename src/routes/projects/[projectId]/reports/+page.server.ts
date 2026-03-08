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
import { eq, and, sql, desc, count, isNotNull, gte, lte, max, isNull } from 'drizzle-orm';

function toDateString(date: Date): string {
	return date.toISOString().slice(0, 10);
}

function parseDate(value: string | null): Date | null {
	if (!value) return null;
	const d = new Date(value);
	return isNaN(d.getTime()) ? null : d;
}

export const load: PageServerLoad = async ({ params, parent, url }) => {
	await parent();
	const projectId = Number(params.projectId);

	// Parse date range from URL params, default to last 30 days
	const today = new Date();
	today.setHours(23, 59, 59, 999);

	const defaultFrom = new Date();
	defaultFrom.setDate(defaultFrom.getDate() - 30);
	defaultFrom.setHours(0, 0, 0, 0);

	const fromParam = url.searchParams.get('from');
	const toParam = url.searchParams.get('to');

	// "all" preset skips date filtering entirely
	const allTime = url.searchParams.get('preset') === 'all';

	let fromDate: Date | null = parseDate(fromParam) ?? defaultFrom;
	let toDate: Date | null = parseDate(toParam) ?? today;

	if (allTime) {
		fromDate = null;
		toDate = null;
	} else {
		// Normalise: from = start of day, to = end of day
		if (fromDate) fromDate.setHours(0, 0, 0, 0);
		if (toDate) toDate.setHours(23, 59, 59, 999);
	}

	// Build the base WHERE condition for testRun rows that belong to this project
	// and fall within the requested date range (filtering on testRun.createdAt).
	function runDateCondition() {
		const conditions = [eq(testRun.projectId, projectId)];
		if (fromDate) conditions.push(gte(testRun.createdAt, fromDate!));
		if (toDate) conditions.push(lte(testRun.createdAt, toDate!));
		return and(...conditions);
	}

	// For queries that filter via testExecution → testRun join
	function execRunDateCondition() {
		const conditions = [eq(testRun.projectId, projectId)];
		if (fromDate) conditions.push(gte(testRun.createdAt, fromDate!));
		if (toDate) conditions.push(lte(testRun.createdAt, toDate!));
		return and(...conditions);
	}

	const [
		envStats,
		recentRuns,
		priorityStats,
		creatorStats,
		assigneeStats,
		dailyResults,
		executorStats,
		topFailingCases,
		flakyTests,
		staleTests
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
			.where(runDateCondition())
			.groupBy(testRun.environment),

		// Recent completed runs with pass rate (for trend)
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
			.where(and(runDateCondition(), eq(testRun.status, 'COMPLETED')))
			.groupBy(testRun.id)
			.orderBy(desc(testRun.finishedAt))
			.limit(50),

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
			.where(execRunDateCondition())
			.groupBy(testCaseVersion.priority),

		// Test cases by creator (not date-filtered — this is a static stat)
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
			.where(and(execRunDateCondition(), isNotNull(testExecution.executedAt)))
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
			.where(execRunDateCondition())
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
			.where(execRunDateCondition())
			.groupBy(testCase.id, testCase.key, testCaseVersion.title)
			.having(
				sql`count(case when ${testExecution.status} = 'FAIL' then 1 end) > 0`
			)
			.orderBy(desc(sql`count(case when ${testExecution.status} = 'FAIL' then 1 end)`))
			.limit(10),

		// Flaky tests: test cases with both PASS and FAIL in the date range
		db
			.select({
				testCaseId: testCase.id,
				testCaseKey: testCase.key,
				title: testCaseVersion.title,
				totalExecs: count(testExecution.id),
				passCount: sql<number>`count(case when ${testExecution.status} = 'PASS' then 1 end)`.as(
					'pass_count'
				),
				failCount: sql<number>`count(case when ${testExecution.status} = 'FAIL' then 1 end)`.as(
					'fail_count'
				)
			})
			.from(testExecution)
			.innerJoin(testCaseVersion, eq(testExecution.testCaseVersionId, testCaseVersion.id))
			.innerJoin(testCase, eq(testCaseVersion.testCaseId, testCase.id))
			.innerJoin(testRun, eq(testExecution.testRunId, testRun.id))
			.where(execRunDateCondition())
			.groupBy(testCase.id, testCase.key, testCaseVersion.title)
			.having(
				sql`count(case when ${testExecution.status} = 'PASS' then 1 end) > 0 AND count(case when ${testExecution.status} = 'FAIL' then 1 end) > 0`
			)
			.orderBy(desc(sql`count(case when ${testExecution.status} = 'FAIL' then 1 end)`))
			.limit(10),

		// Stale test cases: not executed recently (or never executed)
		db
			.select({
				testCaseId: testCase.id,
				testCaseKey: testCase.key,
				title: testCaseVersion.title,
				priority: testCaseVersion.priority,
				lastExecutedAt: max(testExecution.executedAt)
			})
			.from(testCase)
			.innerJoin(testCaseVersion, eq(testCase.latestVersionId, testCaseVersion.id))
			.leftJoin(testExecution, eq(testExecution.testCaseVersionId, testCaseVersion.id))
			.where(eq(testCase.projectId, projectId))
			.groupBy(testCase.id, testCase.key, testCaseVersion.title, testCaseVersion.priority)
			.orderBy(sql`max(${testExecution.executedAt}) ASC NULLS FIRST`)
			.limit(20)
	]);

	return {
		envStats,
		recentRuns: recentRuns.reverse(),
		priorityStats,
		creatorStats,
		assigneeStats,
		dailyResults,
		executorStats,
		topFailingCases,
		flakyTests,
		staleTests,
		dateRange: {
			from: fromDate ? toDateString(fromDate) : null,
			to: toDate ? toDateString(toDate) : null,
			allTime
		}
	};
};
