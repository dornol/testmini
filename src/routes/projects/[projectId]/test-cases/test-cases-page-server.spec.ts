import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();
const mockRequireProjectRole = vi.fn();

vi.mock('$lib/server/db', () => ({ db: mockDb, col: mockDb.col, sql: mockDb.sql }));
vi.mock('$lib/server/db/schema', () => ({
	testCase: {
		id: 'id',
		projectId: 'project_id',
		key: 'key',
		groupId: 'group_id',
		sortOrder: 'sort_order',
		approvalStatus: 'approval_status',
		retestNeeded: 'retest_needed',
		latestVersionId: 'latest_version_id',
		createdBy: 'created_by'
	},
	testCaseVersion: {
		id: 'id',
		testCaseId: 'test_case_id',
		title: 'title',
		priority: 'priority',
		customFields: 'custom_fields',
		updatedBy: 'updated_by'
	},
	testCaseGroup: {
		id: 'id',
		projectId: 'project_id',
		name: 'name',
		sortOrder: 'sort_order',
		color: 'color'
	},
	user: { id: 'id', name: 'name' },
	testRun: {
		id: 'id',
		projectId: 'project_id',
		name: 'name',
		environment: 'environment',
		status: 'status',
		createdAt: 'created_at'
	},
	testExecution: {
		id: 'id',
		testRunId: 'test_run_id',
		testCaseVersionId: 'test_case_version_id',
		status: 'status'
	},
	projectMember: { projectId: 'project_id', userId: 'user_id' },
	testSuite: { id: 'id', projectId: 'project_id', name: 'name' },
	customField: {
		id: 'id',
		projectId: 'project_id',
		name: 'name',
		fieldType: 'field_type',
		options: 'options',
		sortOrder: 'sort_order'
	},
	savedFilter: {
		projectId: 'project_id',
		userId: 'user_id',
		filterType: 'filter_type',
		sortOrder: 'sort_order',
		name: 'name'
	},
	project: { id: 'id', selectedRunIds: 'selected_run_ids', columnSettings: 'column_settings' },
	issueLink: { testCaseId: 'test_case_id' },
	issueTrackerConfig: { id: 'id', projectId: 'project_id' }
}));
vi.mock('drizzle-orm', () => ({
	and: vi.fn((...args: unknown[]) => args),
	asc: vi.fn((a: unknown) => a),
	desc: vi.fn((a: unknown) => a),
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	inArray: vi.fn((a: unknown, b: unknown) => [a, b]),
	sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
		as: vi.fn().mockReturnValue({ strings, values }),
		strings,
		values
	}))
}));
vi.mock('$lib/server/auth-utils', () => ({
	requireAuth: vi.fn((locals: App.Locals) => {
		if (!locals.user) throw new Error('Authentication required');
		return locals.user;
	}),
	requireProjectRole: mockRequireProjectRole,
	parseId: vi.fn((raw: string | undefined) => Number(raw))
}));
vi.mock('$lib/server/queries', () => ({
	loadProjectTags: vi.fn().mockResolvedValue([]),
	loadBatchTags: vi.fn().mockResolvedValue({}),
	loadBatchAssignees: vi.fn().mockResolvedValue({})
}));
vi.mock('$lib/server/test-case-filters', () => ({
	buildTestCaseConditions: vi.fn(() => [])
}));

const { actions } = await import('./+page.server');

const PARAMS = { projectId: '1' };

function makeFormData(entries: Record<string, FormDataEntryValue>): FormData {
	const formData = new FormData();
	for (const [key, value] of Object.entries(entries)) {
		formData.set(key, value);
	}
	return formData;
}

describe('test cases page server actions', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockRequireProjectRole.mockResolvedValue({ role: 'QA' });
	});

	describe('quickCreate', () => {
		it.each([
			[
				{ title: new File(['New case'], 'title.txt'), priority: 'MEDIUM' },
				'Title is required'
			],
			[
				{ title: 'New case', priority: new File(['MEDIUM'], 'priority.txt') },
				'Invalid priority'
			],
			[
				{ title: 'New case', priority: 'MEDIUM', groupId: new File(['1'], 'group-id.txt') },
				'Invalid group ID'
			]
		])('rejects non-text field %# before creating a test case', async (form, message) => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				formData: makeFormData(form)
			});

			const result = await actions.quickCreate(event);

			expect(result).toMatchObject({ status: 400 });
			expect((result as { data: { error: string } }).data.error).toContain(message);
			expect(mockDb.transaction).not.toHaveBeenCalled();
		});

		it.each(['abc', '0', '-1', '+1', '01', '1.5', '1e3', ' 1', '1 '])(
			'rejects invalid groupId %s before creating a test case',
			async (groupId) => {
				const event = createMockEvent({
					method: 'POST',
					params: PARAMS,
					user: testUser,
					formData: makeFormData({ title: 'New case', priority: 'MEDIUM', groupId })
				});

				const result = await actions.quickCreate(event);

				expect(result).toMatchObject({ status: 400, data: { error: 'Invalid group ID' } });
				expect(mockDb.transaction).not.toHaveBeenCalled();
			}
		);
	});
});
