import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();
const mockRequireProjectRole = vi.fn();

vi.mock('$lib/server/db', () => ({ db: mockDb, col: mockDb.col, sql: mockDb.sql }));
vi.mock('$lib/server/db/schema', () => ({
	customField: {
		id: 'id',
		projectId: 'project_id',
		name: 'name',
		fieldType: 'field_type',
		options: 'options',
		required: 'required',
		sortOrder: 'sort_order'
	},
	testCase: {
		id: 'id',
		projectId: 'project_id',
		key: 'key',
		automationKey: 'automation_key',
		createdBy: 'created_by',
		latestVersionId: 'latest_version_id'
	},
	testCaseVersion: {
		id: 'id',
		testCaseId: 'test_case_id'
	}
}));
vi.mock('drizzle-orm', () => ({
	and: vi.fn((...args: unknown[]) => args),
	asc: vi.fn((a: unknown) => a),
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
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

const { actions } = await import('./+page.server');

const PARAMS = { projectId: '1' };
const MAX_TEST_CASE_CREATE_FORM_BODY_SIZE = 256 * 1024;

function makeFormData(entries: Record<string, FormDataEntryValue>): FormData {
	const formData = new FormData();
	for (const [key, value] of Object.entries(entries)) {
		formData.set(key, value);
	}
	return formData;
}

describe('test case new page server actions', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockRequireProjectRole.mockResolvedValue({ role: 'QA' });
	});

	describe('default', () => {
		it('rejects oversized create form bodies before validation or DB writes', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				headers: { 'content-length': String(MAX_TEST_CASE_CREATE_FORM_BODY_SIZE + 1) },
				formData: makeFormData({ title: 'New case', priority: 'MEDIUM' }),
				user: testUser
			});

			await expect(actions.default(event)).rejects.toMatchObject({
				status: 413,
				body: { message: 'Test case create form body is too large' }
			});
			expect(mockDb.query.testCase.findFirst).not.toHaveBeenCalled();
			expect(mockDb.transaction).not.toHaveBeenCalled();
		});

		it('rejects invalid content-length before validation or DB writes', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				headers: { 'content-length': 'invalid' },
				formData: makeFormData({ title: 'New case', priority: 'MEDIUM' }),
				user: testUser
			});

			await expect(actions.default(event)).rejects.toMatchObject({
				status: 400,
				body: { message: 'Invalid content-length header' }
			});
			expect(mockDb.query.testCase.findFirst).not.toHaveBeenCalled();
			expect(mockDb.transaction).not.toHaveBeenCalled();
		});
	});
});
