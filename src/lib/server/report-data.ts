import { cacheGet, cacheSet } from '$lib/server/cache';
import { db } from '$lib/server/db';
import {
	testRun,
	testExecution,
	testCaseVersion,
	testCase,
	testCaseAssignee,
	testCaseGroup,
	issueLink,
	user
} from '$lib/server/db/schema';
import { eq, and, sql, desc, count, isNotNull, gte, lte, max } from 'drizzle-orm';

export interface ReportDateRange {
	from: Date | null;
	to: Date | null;
	allTime: boolean;
}

export function parseDateRange(params: {
	from?: string | null;
	to?: string | null;
	preset?: string | null;
}): ReportDateRange {
	const allTime = params.preset === 'all';

	const today = new Date();
	today.setHours(23, 59, 59, 999);
	const defaultFrom = new Date();
	defaultFrom.setDate(defaultFrom.getDate() - 30);
	defaultFrom.setHours(0, 0, 0, 0);

	if (allTime) return { from: null, to: null, allTime: true };

	const parseDate = (v: string | null | undefined) => {
		if (!v) return null;
		const d = new Date(v);
		return isNaN(d.getTime()) ? null : d;
	};

	const fromDate = parseDate(params.from) ?? defaultFrom;
	const toDate = parseDate(params.to) ?? today;
	fromDate.setHours(0, 0, 0, 0);
	toDate.setHours(23, 59, 59, 999);

	return { from: fromDate, to: toDate, allTime: false };
}

const REPORT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function loadReportData(projectId: number, range: ReportDateRange) {
	const cacheKey = `report:${projectId}:${range.allTime ? 'all' : `${range.from?.getTime()}-${range.to?.getTime()}`}`;
	const cached = cacheGet<Awaited<ReturnType<typeof loadReportDataInternal>>>(cacheKey);
	if (cached) return cached;

	const result = await loadReportDataInternal(projectId, range);
	cacheSet(cacheKey, result, REPORT_CACHE_TTL);
	return result;
}

async function loadReportDataInternal(projectId: number, range: ReportDateRange) {
	function runDateCondition() {
		const conditions = [eq(testRun.projectId, projectId)];
		if (range.from) conditions.push(gte(testRun.createdAt, range.from));
		if (range.to) conditions.push(lte(testRun.createdAt, range.to));
		return and(...conditions);
	}

	function execRunDateCondition() {
		const conditions = [eq(testRun.projectId, projectId)];
		if (range.from) conditions.push(gte(testRun.createdAt, range.from));
		if (range.to) conditions.push(lte(testRun.createdAt, range.to));
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
		staleTests,
		slowestTests,
		defectDensity
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

		// Recent completed runs with pass rate
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

		// Priority breakdown
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
			.having(sql`count(case when ${testExecution.status} = 'FAIL' then 1 end) > 0`)
			.orderBy(desc(sql`count(case when ${testExecution.status} = 'FAIL' then 1 end)`))
			.limit(10),

		// Flaky tests
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

		// Stale test cases
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
			.limit(20),

		// Slowest tests (by average execution duration)
		db
			.select({
				testCaseId: testCase.id,
				testCaseKey: testCase.key,
				title: testCaseVersion.title,
				priority: testCaseVersion.priority,
				execCount: count(testExecution.id),
				avgDuration: sql<number>`round(avg(extract(epoch from (${testExecution.completedAt} - ${testExecution.startedAt})) * 1000))`.as('avg_duration'),
				maxDuration: sql<number>`round(max(extract(epoch from (${testExecution.completedAt} - ${testExecution.startedAt})) * 1000))`.as('max_duration')
			})
			.from(testExecution)
			.innerJoin(testCaseVersion, eq(testExecution.testCaseVersionId, testCaseVersion.id))
			.innerJoin(testCase, eq(testCaseVersion.testCaseId, testCase.id))
			.innerJoin(testRun, eq(testExecution.testRunId, testRun.id))
			.where(and(execRunDateCondition(), isNotNull(testExecution.startedAt), isNotNull(testExecution.completedAt)))
			.groupBy(testCase.id, testCase.key, testCaseVersion.title, testCaseVersion.priority)
			.orderBy(desc(sql`avg(extract(epoch from (${testExecution.completedAt} - ${testExecution.startedAt})))`))
			.limit(20),

		// Defect density by group
		db
			.select({
				groupId: testCaseGroup.id,
				groupName: testCaseGroup.name,
				caseCount: count(sql`distinct ${testCase.id}`),
				defectCount: count(issueLink.id)
			})
			.from(testCase)
			.leftJoin(testCaseGroup, eq(testCase.groupId, testCaseGroup.id))
			.leftJoin(issueLink, eq(issueLink.testCaseId, testCase.id))
			.where(eq(testCase.projectId, projectId))
			.groupBy(testCaseGroup.id, testCaseGroup.name)
			.orderBy(desc(count(issueLink.id)))
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
		slowestTests,
		defectDensity
	};
}
