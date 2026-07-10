import { db } from '$lib/server/db';
import {
	testCase,
	testCaseVersion,
	testCaseTag,
	testCaseAssignee,
	testSuiteItem,
	testExecution
} from '$lib/server/db/schema';
import { eq, and, ilike, or, exists, sql, inArray, isNull } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import {
	parseCanonicalPositiveInteger,
	parseCanonicalPositiveIntegerList
} from '$lib/server/search-param-validation';

export interface TestCaseFilterParams {
	projectId: number;
	search?: string;
	priority?: string;
	tagIds?: string;
	groupId?: string;
	createdBy?: string;
	assigneeId?: string;
	suiteId?: string;
	approvalStatus?: string;
	retestNeeded?: string;
	execStatus?: string;
	customFieldFilters?: { fieldId: number; value: string }[];
}

export type TestCaseExecutionMap = Record<
	number,
	Record<number, { executionId: number; status: string }>
>;

export function parseTestCaseFilterParams(
	projectId: number,
	searchParams: URLSearchParams
): TestCaseFilterParams {
	const customFieldFilters: { fieldId: number; value: string }[] = [];
	for (const [key, value] of searchParams.entries()) {
		if (key.startsWith('cf_') && value) {
			const fieldId = parseCanonicalPositiveInteger(key.slice(3));
			if (fieldId !== null) customFieldFilters.push({ fieldId, value });
		}
	}

	return {
		projectId,
		search: searchParams.get('search') ?? '',
		priority: searchParams.get('priority') ?? '',
		tagIds: searchParams.get('tagIds') ?? '',
		groupId: searchParams.get('groupId') ?? '',
		createdBy: searchParams.get('createdBy') ?? '',
		assigneeId: searchParams.get('assigneeId') ?? '',
		suiteId: searchParams.get('suiteId') ?? '',
		execStatus: searchParams.get('execStatus') ?? '',
		approvalStatus: searchParams.get('approvalStatus') ?? '',
		retestNeeded: searchParams.get('retestNeeded') ?? '',
		customFieldFilters
	};
}

export function buildTestCaseConditions(params: TestCaseFilterParams): SQL {
	const conditions: SQL[] = [eq(testCase.projectId, params.projectId)];

	if (params.search) {
		const term = params.search.trim();
		const keyCondition = ilike(testCase.key, `%${term}%`);
		const titleCondition = ilike(testCaseVersion.title, `%${term}%`);
		// Also try full-text search for word-level matching (English tokenizer)
		const words = term.split(/\s+/).filter(Boolean);
		if (words.length > 0) {
			const query = words
				.map((w) => w.replace(/[^a-zA-Z0-9가-힣ㄱ-ㅎㅏ-ㅣ_-]/g, ''))
				.filter(Boolean)
				.join(' & ');
			if (query) {
				const ftsCondition = sql`test_case_version.search_vector @@ to_tsquery('english', ${query})`;
				conditions.push(or(keyCondition, titleCondition, ftsCondition)!);
			} else {
				conditions.push(or(keyCondition, titleCondition)!);
			}
		} else {
			conditions.push(or(keyCondition, titleCondition)!);
		}
	}

	if (params.priority) {
		const priorities = params.priority.split(',').filter(Boolean);
		if (priorities.length > 0) {
			conditions.push(inArray(testCaseVersion.priority, priorities));
		}
	}

	if (params.tagIds) {
		const tagIdNums = parseCanonicalPositiveIntegerList(params.tagIds);
		for (const tagIdNum of tagIdNums) {
			conditions.push(
				exists(
					db
						.select({ one: sql`1` })
						.from(testCaseTag)
						.where(and(eq(testCaseTag.testCaseId, testCase.id), eq(testCaseTag.tagId, tagIdNum)))
				)
			);
		}
	}

	if (params.groupId) {
		if (params.groupId === 'uncategorized') {
			conditions.push(isNull(testCase.groupId));
		} else {
			const gid = parseCanonicalPositiveInteger(params.groupId);
			if (gid !== null) {
				conditions.push(eq(testCase.groupId, gid));
			}
		}
	}

	if (params.createdBy) {
		const createdByIds = params.createdBy.split(',').filter(Boolean);
		if (createdByIds.length > 0) {
			conditions.push(inArray(testCase.createdBy, createdByIds));
		}
	}

	if (params.assigneeId) {
		const assigneeIds = params.assigneeId.split(',').filter(Boolean);
		if (assigneeIds.length > 0) {
			conditions.push(
				exists(
					db
						.select({ one: sql`1` })
						.from(testCaseAssignee)
						.where(
							and(
								eq(testCaseAssignee.testCaseId, testCase.id),
								inArray(testCaseAssignee.userId, assigneeIds)
							)
						)
				)
			);
		}
	}

	if (params.suiteId) {
		const suiteIdNums = parseCanonicalPositiveIntegerList(params.suiteId);
		if (suiteIdNums.length > 0) {
			conditions.push(
				exists(
					db
						.select({ one: sql`1` })
						.from(testSuiteItem)
						.where(
							and(
								eq(testSuiteItem.testCaseId, testCase.id),
								inArray(testSuiteItem.suiteId, suiteIdNums)
							)
						)
				)
			);
		}
	}

	if (params.approvalStatus) {
		const statuses = params.approvalStatus.split(',').filter(Boolean);
		if (statuses.length > 0) {
			conditions.push(inArray(testCase.approvalStatus, statuses));
		}
	}

	if (params.retestNeeded === 'true') {
		conditions.push(eq(testCase.retestNeeded, true));
	}

	if (params.customFieldFilters && params.customFieldFilters.length > 0) {
		for (const filter of params.customFieldFilters) {
			const key = String(filter.fieldId);
			if (!/^[\w-]+$/.test(key)) {
				continue; // skip keys with unsafe characters
			}
			conditions.push(
				sql`${testCaseVersion.customFields}->>${key} ILIKE ${'%' + filter.value + '%'}`
			);
		}
	}

	return and(...conditions)!;
}

export async function loadTestCaseExecutionMap(
	selectedRunIds: number[],
	projectId: number,
	tcIds: Set<number>
): Promise<TestCaseExecutionMap> {
	const executionMap: TestCaseExecutionMap = {};
	if (selectedRunIds.length === 0 || tcIds.size === 0) return executionMap;

	const executions = await db
		.select({
			executionId: testExecution.id,
			testRunId: testExecution.testRunId,
			testCaseId: testCase.id,
			status: testExecution.status
		})
		.from(testExecution)
		.innerJoin(testCaseVersion, eq(testExecution.testCaseVersionId, testCaseVersion.id))
		.innerJoin(testCase, eq(testCaseVersion.testCaseId, testCase.id))
		.where(
			and(
				inArray(testExecution.testRunId, selectedRunIds),
				eq(testCase.projectId, projectId),
				inArray(testCase.id, [...tcIds])
			)
		);

	for (const exec of executions) {
		if (!executionMap[exec.testCaseId]) {
			executionMap[exec.testCaseId] = {};
		}
		executionMap[exec.testCaseId][exec.testRunId] = {
			executionId: exec.executionId,
			status: exec.status
		};
	}
	return executionMap;
}

export function applyExecutionStatusFilter<T extends { id: number }>(
	testCases: T[],
	executionMap: TestCaseExecutionMap,
	execStatus: string,
	selectedRunIds: number[]
): T[] {
	if (!execStatus || selectedRunIds.length === 0) return testCases;

	const execStatuses = execStatus.split(',').filter(Boolean);
	if (execStatuses.length === 0) return testCases;

	const hasNotExecuted = execStatuses.includes('NOT_EXECUTED');
	const otherStatuses = execStatuses.filter((status) => status !== 'NOT_EXECUTED');
	return testCases.filter((tc) => {
		const tcExecutions = executionMap[tc.id];
		const isNotExecuted = !tcExecutions || selectedRunIds.every((runId) => !tcExecutions[runId]);
		if (hasNotExecuted && isNotExecuted) return true;
		if (otherStatuses.length > 0 && tcExecutions) {
			return selectedRunIds.some((runId) => {
				const execution = tcExecutions[runId];
				return execution ? otherStatuses.includes(execution.status) : false;
			});
		}
		return false;
	});
}
