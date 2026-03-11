import { db } from '$lib/server/db';
import {
	testCase,
	testCaseVersion,
	testCaseTag,
	testCaseAssignee,
	testSuiteItem
} from '$lib/server/db/schema';
import { eq, and, ilike, or, exists, sql, inArray, isNull } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

interface TestCaseFilterParams {
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
	customFieldFilters?: { fieldId: number; value: string }[];
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
			const query = words.map((w) => w.replace(/[^a-zA-Z0-9가-힣ㄱ-ㅎㅏ-ㅣ_-]/g, '')).filter(Boolean).join(' & ');
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
		const tagIdNums = params.tagIds
			.split(',')
			.map(Number)
			.filter((id) => !isNaN(id) && id > 0);
		for (const tagIdNum of tagIdNums) {
			conditions.push(
				exists(
					db
						.select({ one: sql`1` })
						.from(testCaseTag)
						.where(
							and(
								eq(testCaseTag.testCaseId, testCase.id),
								eq(testCaseTag.tagId, tagIdNum)
							)
						)
				)
			);
		}
	}

	if (params.groupId) {
		if (params.groupId === 'uncategorized') {
			conditions.push(isNull(testCase.groupId));
		} else {
			const gid = Number(params.groupId);
			if (!isNaN(gid) && gid > 0) {
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
		const suiteIdNums = params.suiteId
			.split(',')
			.map(Number)
			.filter((id) => !isNaN(id) && id > 0);
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
