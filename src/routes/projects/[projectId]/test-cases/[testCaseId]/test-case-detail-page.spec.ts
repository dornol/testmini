import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({
	db: mockDb,
	col: mockDb.col,
	sql: mockDb.sql,
	findTestCaseWithLatestVersion: vi.fn()
}));
vi.mock('$lib/server/db/schema', () => ({
	customField: { id: 'id', projectId: 'project_id', sortOrder: 'sort_order' },
	issueLink: { id: 'id', testCaseId: 'test_case_id', createdAt: 'created_at' },
	issueTrackerConfig: { projectId: 'project_id', enabled: 'enabled' },
	projectMember: { projectId: 'project_id', userId: 'user_id' },
	tag: { id: 'id', projectId: 'project_id', name: 'name', color: 'color' },
	testCase: { id: 'id', projectId: 'project_id', automationKey: 'automation_key' },
	testCaseAssignee: { testCaseId: 'test_case_id', userId: 'user_id' },
	testCaseDataSet: { testCaseId: 'test_case_id', orderIndex: 'order_index' },
	testCaseParameter: { testCaseId: 'test_case_id', orderIndex: 'order_index' },
	testCaseTag: { testCaseId: 'test_case_id', tagId: 'tag_id' },
	testCaseVersion: {
		id: 'id',
		testCaseId: 'test_case_id',
		versionNo: 'version_no',
		title: 'title',
		priority: 'priority',
		updatedBy: 'updated_by',
		createdAt: 'created_at'
	},
	user: { id: 'id', name: 'name' }
}));
vi.mock('drizzle-orm', () => ({
	and: vi.fn((...args: unknown[]) => args),
	asc: vi.fn((a: unknown) => a),
	desc: vi.fn((a: unknown) => a),
	eq: vi.fn((a: unknown, b: unknown) => [a, b])
}));
vi.mock('$lib/server/auth-utils', async () => {
	const actual =
		await vi.importActual<typeof import('$lib/server/auth-utils')>('$lib/server/auth-utils');
	return {
		...actual,
		requireProjectRole: vi.fn().mockResolvedValue({ role: 'DEV' })
	};
});
vi.mock('$lib/server/queries', () => ({ loadTestCaseMetadata: vi.fn() }));
vi.mock('$lib/server/cache', () => ({ cacheDelete: vi.fn() }));

const { actions } = await import('./+page.server');
const authUtils = await import('$lib/server/auth-utils');

const PARAMS = { projectId: '1', testCaseId: '10' };

function makeFormData(entries: Record<string, string>): FormData {
	const fd = new FormData();
	for (const [key, value] of Object.entries(entries)) {
		fd.set(key, value);
	}
	return fd;
}

describe('test case detail page actions', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(authUtils.requireProjectRole).mockResolvedValue({ role: 'DEV' });
	});

	describe('assignTag', () => {
		it('rejects invalid tagId before querying tag records', async () => {
			for (const tagId of [
				'abc',
				'0',
				'-1',
				'+1',
				'01',
				'1.5',
				'1e3',
				' 1',
				'1 ',
				String(Number.MAX_SAFE_INTEGER + 1)
			]) {
				vi.clearAllMocks();
				vi.mocked(authUtils.requireProjectRole).mockResolvedValue({ role: 'DEV' });
				const event = createMockEvent({
					method: 'POST',
					params: PARAMS,
					formData: makeFormData({ tagId }),
					user: testUser
				});

				const result = await actions.assignTag(event);

				expect(result).toMatchObject({ status: 400, data: { error: 'Invalid tagId' } });
				expect(mockDb.query.tag.findFirst).not.toHaveBeenCalled();
				expect(mockDb.query.testCaseTag.findFirst).not.toHaveBeenCalled();
				expect(mockDb.insert).not.toHaveBeenCalled();
			}
		});
	});

	describe('removeTag', () => {
		it('rejects invalid tagId before deleting tag assignments', async () => {
			for (const tagId of [
				'abc',
				'0',
				'-1',
				'+1',
				'01',
				'1.5',
				'1e3',
				' 1',
				'1 ',
				String(Number.MAX_SAFE_INTEGER + 1)
			]) {
				vi.clearAllMocks();
				vi.mocked(authUtils.requireProjectRole).mockResolvedValue({ role: 'DEV' });
				const event = createMockEvent({
					method: 'POST',
					params: PARAMS,
					formData: makeFormData({ tagId }),
					user: testUser
				});

				const result = await actions.removeTag(event);

				expect(result).toMatchObject({ status: 400, data: { error: 'Invalid tagId' } });
				expect(mockDb.delete).not.toHaveBeenCalled();
			}
		});

		it('rejects removal when the test case is outside the current project', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValue(null);
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				formData: makeFormData({ tagId: '7' }),
				user: testUser
			});

			await expect(actions.removeTag(event)).rejects.toThrow();
			expect(mockDb.delete).not.toHaveBeenCalled();
		});
	});

	describe('assignAssignee', () => {
		it('rejects assignment when the test case is outside the current project', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValue(null);
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				formData: makeFormData({ userId: 'user-2' }),
				user: testUser
			});

			await expect(actions.assignAssignee(event)).rejects.toThrow();
			expect(mockDb.query.projectMember.findFirst).not.toHaveBeenCalled();
			expect(mockDb.insert).not.toHaveBeenCalled();
		});
	});

	describe('removeAssignee', () => {
		it('rejects removal when the test case is outside the current project', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValue(null);
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				formData: makeFormData({ userId: 'user-2' }),
				user: testUser
			});

			await expect(actions.removeAssignee(event)).rejects.toThrow();
			expect(mockDb.delete).not.toHaveBeenCalled();
		});
	});

	describe('delete', () => {
		it('scopes test case deletes to the current project', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValueOnce({
				id: 10,
				projectId: 1
			});

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser
			});

			const result = await actions.delete(event);

			expect(result).toEqual({ deleted: true });
			expect(mockDb._chains.delete.where).toHaveBeenCalledWith(
				expect.arrayContaining([
					['id', 10],
					['project_id', 1]
				])
			);
		});
	});
});
