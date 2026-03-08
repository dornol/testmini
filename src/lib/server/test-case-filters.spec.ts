import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb } from '$lib/server/test-helpers/mock-db';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({
	db: mockDb
}));

vi.mock('$lib/server/db/schema', () => ({
	testCase: {
		id: 'id',
		projectId: 'project_id',
		key: 'key',
		groupId: 'group_id',
		createdBy: 'created_by',
		approvalStatus: 'approval_status'
	},
	testCaseVersion: {
		priority: 'priority',
		customFields: 'custom_fields',
		searchVector: 'search_vector'
	},
	testCaseTag: { testCaseId: 'test_case_id', tagId: 'tag_id' },
	testCaseAssignee: { testCaseId: 'test_case_id', userId: 'user_id' },
	testSuiteItem: { testCaseId: 'test_case_id', suiteId: 'suite_id' }
}));

const mockEq = vi.fn((a, b) => ({ type: 'eq', field: a, value: b }));
const mockAnd = vi.fn((...args) => ({ type: 'and', conditions: args.filter(Boolean) }));
const mockOr = vi.fn((...args) => ({ type: 'or', conditions: args.filter(Boolean) }));
const mockIlike = vi.fn((a, b) => ({ type: 'ilike', field: a, pattern: b }));
const mockExists = vi.fn((subquery) => ({ type: 'exists', subquery }));
const mockInArray = vi.fn((a, b) => ({ type: 'inArray', field: a, values: b }));
const mockIsNull = vi.fn((a) => ({ type: 'isNull', field: a }));
const mockSql = Object.assign(
	(strings: TemplateStringsArray, ...values: unknown[]) => ({
		type: 'sql',
		strings: Array.from(strings),
		values
	}),
	{ raw: (s: string) => s }
);

vi.mock('drizzle-orm', () => ({
	eq: mockEq,
	and: mockAnd,
	or: mockOr,
	ilike: mockIlike,
	exists: mockExists,
	inArray: mockInArray,
	isNull: mockIsNull,
	sql: mockSql
}));

const { buildTestCaseConditions } = await import('./test-case-filters');

describe('buildTestCaseConditions', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// 1. Only projectId (minimal params)
	it('should return eq condition for projectId only', () => {
		const result = buildTestCaseConditions({ projectId: 1 });

		expect(mockEq).toHaveBeenCalledWith('project_id', 1);
		expect(mockAnd).toHaveBeenCalledTimes(1);
		// and() should be called with exactly one condition (the projectId eq)
		expect(mockAnd.mock.calls[0]).toHaveLength(1);
		expect(result).toEqual({
			type: 'and',
			conditions: [{ type: 'eq', field: 'project_id', value: 1 }]
		});
	});

	// 2. search filter — should produce or(ilike, sql FTS)
	it('should add search condition with or(ilike, fts)', () => {
		buildTestCaseConditions({ projectId: 1, search: 'login' });

		expect(mockIlike).toHaveBeenCalledWith('key', '%login%');
		expect(mockOr).toHaveBeenCalledTimes(1);
		// and() should be called with 2 conditions: projectId eq + or(search)
		expect(mockAnd.mock.calls[0]).toHaveLength(2);
	});

	// 3. priority filter — single value
	it('should add inArray for single priority', () => {
		buildTestCaseConditions({ projectId: 1, priority: 'high' });

		expect(mockInArray).toHaveBeenCalledWith('priority', ['high']);
		expect(mockAnd.mock.calls[0]).toHaveLength(2);
	});

	// 4. priority filter — multiple comma-separated values
	it('should add inArray for multiple priorities', () => {
		buildTestCaseConditions({ projectId: 1, priority: 'high,medium,low' });

		expect(mockInArray).toHaveBeenCalledWith('priority', ['high', 'medium', 'low']);
		expect(mockAnd.mock.calls[0]).toHaveLength(2);
	});

	// 5. tagIds filter — single tag, produces exists subquery
	it('should add exists subquery for single tagId', () => {
		buildTestCaseConditions({ projectId: 1, tagIds: '5' });

		expect(mockExists).toHaveBeenCalledTimes(1);
		// eq should be called for: projectId, testCaseTag.testCaseId, testCaseTag.tagId
		expect(mockEq).toHaveBeenCalledWith('tag_id', 5);
		expect(mockAnd.mock.calls[0]).toHaveLength(2); // projectId + 1 exists
	});

	// 6. tagIds filter — multiple tags, produces multiple exists
	it('should add multiple exists subqueries for multiple tagIds', () => {
		buildTestCaseConditions({ projectId: 1, tagIds: '5,10,15' });

		expect(mockExists).toHaveBeenCalledTimes(3);
		expect(mockEq).toHaveBeenCalledWith('tag_id', 5);
		expect(mockEq).toHaveBeenCalledWith('tag_id', 10);
		expect(mockEq).toHaveBeenCalledWith('tag_id', 15);
		// The last and() call is the outer one combining all conditions
		const outerAndCall = mockAnd.mock.calls[mockAnd.mock.calls.length - 1];
		expect(outerAndCall).toHaveLength(4); // projectId + 3 exists
	});

	// 7. tagIds filter — invalid values (NaN, 0, negative) should be ignored
	it('should ignore invalid tagIds (NaN, 0, negative)', () => {
		buildTestCaseConditions({ projectId: 1, tagIds: 'abc,0,-1,5' });

		expect(mockExists).toHaveBeenCalledTimes(1);
		expect(mockEq).toHaveBeenCalledWith('tag_id', 5);
		expect(mockAnd.mock.calls[0]).toHaveLength(2); // projectId + 1 valid exists
	});

	// 8. groupId = 'uncategorized' — should produce isNull
	it('should add isNull for groupId uncategorized', () => {
		buildTestCaseConditions({ projectId: 1, groupId: 'uncategorized' });

		expect(mockIsNull).toHaveBeenCalledWith('group_id');
		expect(mockAnd.mock.calls[0]).toHaveLength(2);
	});

	// 9. groupId = numeric — should produce eq
	it('should add eq for numeric groupId', () => {
		buildTestCaseConditions({ projectId: 1, groupId: '7' });

		expect(mockEq).toHaveBeenCalledWith('group_id', 7);
		expect(mockAnd.mock.calls[0]).toHaveLength(2);
	});

	// 10. groupId = invalid string — should not add condition
	it('should not add condition for invalid groupId string', () => {
		buildTestCaseConditions({ projectId: 1, groupId: 'invalid' });

		expect(mockIsNull).not.toHaveBeenCalled();
		// eq should only be called once for projectId
		expect(mockEq).toHaveBeenCalledTimes(1);
		expect(mockAnd.mock.calls[0]).toHaveLength(1);
	});

	// 11. createdBy filter — single
	it('should add inArray for single createdBy', () => {
		buildTestCaseConditions({ projectId: 1, createdBy: 'user-1' });

		expect(mockInArray).toHaveBeenCalledWith('created_by', ['user-1']);
		expect(mockAnd.mock.calls[0]).toHaveLength(2);
	});

	// 12. createdBy filter — multiple comma-separated
	it('should add inArray for multiple createdBy', () => {
		buildTestCaseConditions({ projectId: 1, createdBy: 'user-1,user-2,user-3' });

		expect(mockInArray).toHaveBeenCalledWith('created_by', ['user-1', 'user-2', 'user-3']);
		expect(mockAnd.mock.calls[0]).toHaveLength(2);
	});

	// 13. assigneeId filter — produces exists subquery
	it('should add exists subquery for assigneeId', () => {
		buildTestCaseConditions({ projectId: 1, assigneeId: 'user-1' });

		expect(mockExists).toHaveBeenCalledTimes(1);
		expect(mockInArray).toHaveBeenCalledWith('user_id', ['user-1']);
		expect(mockAnd.mock.calls[0]).toHaveLength(2);
	});

	// 14. suiteId filter — produces exists subquery
	it('should add exists subquery for suiteId', () => {
		buildTestCaseConditions({ projectId: 1, suiteId: '3' });

		expect(mockExists).toHaveBeenCalledTimes(1);
		expect(mockInArray).toHaveBeenCalledWith('suite_id', [3]);
		expect(mockAnd.mock.calls[0]).toHaveLength(2);
	});

	// 15. suiteId filter — invalid values ignored
	it('should ignore invalid suiteId values', () => {
		buildTestCaseConditions({ projectId: 1, suiteId: 'abc,0,-5' });

		expect(mockExists).not.toHaveBeenCalled();
		expect(mockAnd.mock.calls[0]).toHaveLength(1); // only projectId
	});

	// 16. approvalStatus filter — single
	it('should add inArray for single approvalStatus', () => {
		buildTestCaseConditions({ projectId: 1, approvalStatus: 'approved' });

		expect(mockInArray).toHaveBeenCalledWith('approval_status', ['approved']);
		expect(mockAnd.mock.calls[0]).toHaveLength(2);
	});

	// 17. approvalStatus filter — multiple
	it('should add inArray for multiple approvalStatus', () => {
		buildTestCaseConditions({ projectId: 1, approvalStatus: 'approved,pending,rejected' });

		expect(mockInArray).toHaveBeenCalledWith('approval_status', [
			'approved',
			'pending',
			'rejected'
		]);
		expect(mockAnd.mock.calls[0]).toHaveLength(2);
	});

	// 18. customFieldFilters — single field
	it('should add sql condition for single customFieldFilter', () => {
		buildTestCaseConditions({
			projectId: 1,
			customFieldFilters: [{ fieldId: 42, value: 'foo' }]
		});

		// and() should be called with 2 conditions: projectId + custom field sql
		expect(mockAnd.mock.calls[0]).toHaveLength(2);
		const sqlCondition = mockAnd.mock.calls[0][1];
		expect(sqlCondition.type).toBe('sql');
		expect(sqlCondition.values).toContain('%foo%');
	});

	// 19. customFieldFilters — multiple fields
	it('should add sql conditions for multiple customFieldFilters', () => {
		buildTestCaseConditions({
			projectId: 1,
			customFieldFilters: [
				{ fieldId: 42, value: 'foo' },
				{ fieldId: 99, value: 'bar' }
			]
		});

		expect(mockAnd.mock.calls[0]).toHaveLength(3); // projectId + 2 custom fields
		const sql1 = mockAnd.mock.calls[0][1];
		const sql2 = mockAnd.mock.calls[0][2];
		expect(sql1.type).toBe('sql');
		expect(sql2.type).toBe('sql');
		expect(sql1.values).toContain('%foo%');
		expect(sql2.values).toContain('%bar%');
	});

	// 20. All filters combined
	it('should combine all filters with and', () => {
		buildTestCaseConditions({
			projectId: 1,
			search: 'test',
			priority: 'high',
			tagIds: '5',
			groupId: '3',
			createdBy: 'user-1',
			assigneeId: 'user-2',
			suiteId: '10',
			approvalStatus: 'approved',
			customFieldFilters: [{ fieldId: 1, value: 'val' }]
		});

		// Inner and() calls: tag subquery(1) + assignee subquery(1) + suite subquery(1) + outer(1) = 4
		expect(mockAnd).toHaveBeenCalledTimes(4);
		// The last and() call is the outer one combining all conditions
		// Conditions: projectId(1) + search(1) + priority(1) + tag exists(1) + groupId(1) + createdBy(1) + assigneeId(1) + suiteId(1) + approvalStatus(1) + customField(1) = 10
		const outerAndCall = mockAnd.mock.calls[mockAnd.mock.calls.length - 1];
		expect(outerAndCall).toHaveLength(10);
	});

	// 21. Empty string filters — should not add conditions
	it('should not add conditions for empty string filters', () => {
		buildTestCaseConditions({
			projectId: 1,
			search: '',
			priority: '',
			tagIds: '',
			groupId: '',
			createdBy: '',
			assigneeId: '',
			suiteId: '',
			approvalStatus: ''
		});

		expect(mockAnd.mock.calls[0]).toHaveLength(1); // only projectId
		expect(mockOr).not.toHaveBeenCalled();
		expect(mockInArray).not.toHaveBeenCalled();
		expect(mockExists).not.toHaveBeenCalled();
		expect(mockIsNull).not.toHaveBeenCalled();
	});

	// 22. search with multiple words — should join with ' & '
	it('should join multiple search words with & for FTS', () => {
		buildTestCaseConditions({ projectId: 1, search: 'login page test' });

		expect(mockIlike).toHaveBeenCalledWith('key', '%login page test%');
		expect(mockOr).toHaveBeenCalledTimes(1);

		// The sql tagged template should receive the joined query
		const orArgs = mockOr.mock.calls[0];
		const ftsCondition = orArgs[1]; // second arg to or() is the FTS sql
		expect(ftsCondition.type).toBe('sql');
		expect(ftsCondition.values).toContain('login & page & test');
	});
});
