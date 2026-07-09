import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockSelectResult } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb, col: mockDb.col, sql: mockDb.sql }));
vi.mock('$lib/server/db/schema', () => ({
	testCase: {
		id: 'id',
		projectId: 'project_id',
		key: 'key',
		groupId: 'group_id',
		sortOrder: 'sort_order',
		latestVersionId: 'latest_version_id',
		createdBy: 'created_by',
		createdAt: 'created_at'
	},
	testCaseVersion: {
		id: 'id',
		testCaseId: 'test_case_id',
		versionNo: 'version_no',
		title: 'title',
		precondition: 'precondition',
		steps: 'steps',
		expectedResult: 'expected_result',
		priority: 'priority',
		revision: 'revision',
		updatedBy: 'updated_by',
		createdAt: 'created_at'
	},
	testCaseTag: { testCaseId: 'test_case_id', tagId: 'tag_id' },
	testCaseAssignee: { testCaseId: 'test_case_id', userId: 'user_id' },
	tag: { id: 'id', projectId: 'project_id' },
	projectMember: { projectId: 'project_id', userId: 'user_id', role: 'role' }
}));
vi.mock('drizzle-orm', () => ({
	and: vi.fn((...args: unknown[]) => args),
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	inArray: vi.fn((a: unknown, b: unknown) => ['inArray', a, b]),
	sql: Object.assign(
		(strings: TemplateStringsArray, ...values: unknown[]) => ({
			as: () => ({ sql: strings, values })
		}),
		{ raw: (s: string) => s }
	)
}));

// Import after mocks
const { POST } = await import('./+server');

const viewerUser = {
	id: 'viewer-1',
	name: 'Viewer User',
	email: 'viewer@example.com',
	role: 'user',
	image: null,
	emailVerified: true,
	createdAt: new Date('2025-01-01'),
	updatedAt: new Date('2025-01-01')
} as unknown as NonNullable<App.Locals['user']>;

function createTxWriteChains() {
	const updateChain = {
		set: vi.fn().mockReturnThis(),
		where: vi.fn().mockResolvedValue(undefined)
	};
	const deleteChain = {
		where: vi.fn().mockResolvedValue(undefined)
	};
	const tx = {
		update: vi.fn().mockReturnValue(updateChain),
		delete: vi.fn().mockReturnValue(deleteChain),
		insert: vi
			.fn()
			.mockReturnValue({ values: vi.fn().mockReturnThis(), onConflictDoNothing: vi.fn() }),
		query: {
			tag: { findFirst: vi.fn() },
			priorityConfig: { findFirst: vi.fn() },
			projectMember: { findFirst: vi.fn() }
		}
	};
	return { tx, updateChain, deleteChain };
}

describe('/api/projects/[projectId]/test-cases/bulk', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('POST', () => {
		it('should return 400 when testCaseIds array exceeds 200 items', async () => {
			const oversizedIds = Array.from({ length: 201 }, (_, i) => i + 1);

			// Mock requireProjectRole: user has QA role
			mockDb.query.projectMember.findFirst.mockResolvedValue({ role: 'QA' });

			const event = createMockEvent({
				method: 'POST',
				params: { projectId: '1' },
				body: { action: 'addTag', testCaseIds: oversizedIds, tagId: 1 },
				user: testUser
			});
			const response = await POST(event);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toBe('Batch size cannot exceed 200 items');
		});

		it('should return 400 when testCaseIds is empty', async () => {
			// Mock requireProjectRole: user has QA role
			mockDb.query.projectMember.findFirst.mockResolvedValue({ role: 'QA' });

			const event = createMockEvent({
				method: 'POST',
				params: { projectId: '1' },
				body: { action: 'addTag', testCaseIds: [], tagId: 1 },
				user: testUser
			});
			const response = await POST(event);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toBe('No test cases specified');
		});

		it('should return 403 for unauthorized role (VIEWER)', async () => {
			// Mock requireProjectRole: user has VIEWER role (not in allowed list)
			mockDb.query.projectMember.findFirst.mockResolvedValue({ role: 'VIEWER' });

			const event = createMockEvent({
				method: 'POST',
				params: { projectId: '1' },
				body: { action: 'addTag', testCaseIds: [1, 2], tagId: 1 },
				user: viewerUser
			});
			await expect(POST(event)).rejects.toThrow();
		});

		it('should scope moveToGroup updates to the current project', async () => {
			mockDb.query.projectMember.findFirst.mockResolvedValue({ role: 'QA' });
			mockSelectResult(mockDb, [{ id: 10 }, { id: 11 }]);
			const { tx, updateChain } = createTxWriteChains();
			mockDb.transaction.mockImplementationOnce(async (fn) => fn(tx));

			const event = createMockEvent({
				method: 'POST',
				params: { projectId: '1' },
				body: { action: 'moveToGroup', testCaseIds: [10, 11], groupId: 3 },
				user: testUser
			});

			const response = await POST(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data).toEqual({ success: true, affected: 2 });
			expect(updateChain.where).toHaveBeenCalledWith(
				expect.arrayContaining([
					['inArray', 'id', [10, 11]],
					['project_id', 1]
				])
			);
		});

		it('should scope bulk deletes to the current project', async () => {
			mockDb.query.projectMember.findFirst.mockResolvedValue({ role: 'PROJECT_ADMIN' });
			mockSelectResult(mockDb, [{ id: 10 }, { id: 11 }]);
			const { tx, deleteChain } = createTxWriteChains();
			mockDb.transaction.mockImplementationOnce(async (fn) => fn(tx));

			const event = createMockEvent({
				method: 'POST',
				params: { projectId: '1' },
				body: { action: 'delete', testCaseIds: [10, 11] },
				user: testUser
			});

			const response = await POST(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data).toEqual({ success: true, affected: 2 });
			expect(deleteChain.where).toHaveBeenCalledWith(
				expect.arrayContaining([
					['inArray', 'id', [10, 11]],
					['project_id', 1]
				])
			);
		});

		it('should reject removeTag when the tag is not in the current project', async () => {
			mockDb.query.projectMember.findFirst.mockResolvedValue({ role: 'QA' });
			mockSelectResult(mockDb, [{ id: 10 }]);
			const { tx } = createTxWriteChains();
			tx.query.tag.findFirst.mockResolvedValue(null);
			mockDb.transaction.mockImplementationOnce(async (fn) => fn(tx));

			const event = createMockEvent({
				method: 'POST',
				params: { projectId: '1' },
				body: { action: 'removeTag', testCaseIds: [10], tagId: 99 },
				user: testUser
			});

			const response = await POST(event);
			const data = await response.json();

			expect(response.status).toBe(404);
			expect(data.error).toBe('Tag not found');
			expect(tx.delete).not.toHaveBeenCalled();
			expect(tx.query.tag.findFirst).toHaveBeenCalledWith({
				where: expect.arrayContaining([
					['id', 99],
					['project_id', 1]
				])
			});
		});
	});
});
