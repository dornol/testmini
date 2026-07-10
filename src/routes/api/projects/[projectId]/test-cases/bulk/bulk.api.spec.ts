import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockSelectResult } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();
const mockFindTestCasesWithLatestVersions = vi.fn();

vi.mock('$lib/server/db', () => ({
	db: mockDb,
	col: mockDb.col,
	sql: mockDb.sql,
	findTestCasesWithLatestVersions: mockFindTestCasesWithLatestVersions
}));
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
	projectMember: { projectId: 'project_id', userId: 'user_id', role: 'role' },
	testCaseGroup: { id: 'id', projectId: 'project_id' },
	priorityConfig: { projectId: 'project_id', name: 'name' }
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
		where: vi.fn().mockReturnThis(),
		returning: vi.fn().mockResolvedValue([{ id: 10 }, { id: 11 }])
	};
	const deleteChain = {
		where: vi.fn().mockReturnThis(),
		returning: vi.fn().mockResolvedValue([{ id: 10 }, { id: 11 }])
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
		mockFindTestCasesWithLatestVersions.mockReset();
		mockDb.query.project.findFirst.mockResolvedValue({ id: 1 });
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

		it('should return 400 when request body is not an object', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: { projectId: '1' },
				body: ['invalid'],
				user: testUser
			});
			const response = await POST(event);

			expect(response.status).toBe(400);
			expect(mockDb.select).not.toHaveBeenCalled();
			expect(mockDb.transaction).not.toHaveBeenCalled();
		});

		it('should return 400 when action is invalid', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: { projectId: '1' },
				body: { action: 'publish', testCaseIds: [1] },
				user: testUser
			});
			const response = await POST(event);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toBe('Invalid action');
			expect(mockDb.select).not.toHaveBeenCalled();
			expect(mockDb.transaction).not.toHaveBeenCalled();
		});

		it('should return 400 for unknown fields before DB reads', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: { projectId: '1' },
				body: { action: 'clone', testCaseIds: [1], force: true },
				user: testUser
			});
			const response = await POST(event);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toBe('Unknown field(s): force');
			expect(mockDb.select).not.toHaveBeenCalled();
			expect(mockDb.transaction).not.toHaveBeenCalled();
		});

		it('should return 400 for fields that do not belong to the selected action', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: { projectId: '1' },
				body: { action: 'delete', testCaseIds: [1], priority: 'HIGH' },
				user: testUser
			});
			const response = await POST(event);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toBe('Unknown field(s): priority');
			expect(mockDb.select).not.toHaveBeenCalled();
			expect(mockDb.transaction).not.toHaveBeenCalled();
		});

		it('should return 400 when testCaseIds contains invalid IDs', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: { projectId: '1' },
				body: { action: 'clone', testCaseIds: [1, 0] },
				user: testUser
			});
			const response = await POST(event);

			expect(response.status).toBe(400);
			expect(mockDb.select).not.toHaveBeenCalled();
			expect(mockDb.transaction).not.toHaveBeenCalled();
		});

		it('should return 400 when testCaseIds contains duplicates', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: { projectId: '1' },
				body: { action: 'clone', testCaseIds: [1, 1] },
				user: testUser
			});
			const response = await POST(event);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toContain('duplicates');
			expect(mockDb.select).not.toHaveBeenCalled();
			expect(mockDb.transaction).not.toHaveBeenCalled();
		});

		it('should return 400 when addTag has an invalid tagId', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: { projectId: '1' },
				body: { action: 'addTag', testCaseIds: [1], tagId: '1' },
				user: testUser
			});
			const response = await POST(event);

			expect(response.status).toBe(400);
			expect(mockDb.select).not.toHaveBeenCalled();
			expect(mockDb.transaction).not.toHaveBeenCalled();
		});

		it('should return 400 when setPriority has an invalid priority', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: { projectId: '1' },
				body: { action: 'setPriority', testCaseIds: [1], priority: '' },
				user: testUser
			});
			const response = await POST(event);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toBe('Invalid priority');
			expect(mockDb.select).not.toHaveBeenCalled();
			expect(mockDb.transaction).not.toHaveBeenCalled();
		});

		it('should return 400 when setPriority contains control characters', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: { projectId: '1' },
				body: { action: 'setPriority', testCaseIds: [1], priority: 'HIGH\u0000' },
				user: testUser
			});
			const response = await POST(event);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toBe('Invalid priority');
			expect(mockDb.select).not.toHaveBeenCalled();
			expect(mockDb.transaction).not.toHaveBeenCalled();
		});

		it('should return 400 when userId contains control characters', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: { projectId: '1' },
				body: { action: 'addAssignee', testCaseIds: [1], userId: 'user\u0000id' },
				user: testUser
			});
			const response = await POST(event);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toBe('userId required');
			expect(mockDb.select).not.toHaveBeenCalled();
			expect(mockDb.transaction).not.toHaveBeenCalled();
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
			mockDb.query.testCaseGroup.findFirst.mockResolvedValue({ id: 3, projectId: 1 });
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
			expect(updateChain.returning).toHaveBeenCalledWith({ id: 'id' });
		});

		it('should return 404 when moveToGroup updates fewer rows than requested', async () => {
			mockDb.query.projectMember.findFirst.mockResolvedValue({ role: 'QA' });
			mockDb.query.testCaseGroup.findFirst.mockResolvedValue({ id: 3, projectId: 1 });
			mockSelectResult(mockDb, [{ id: 10 }, { id: 11 }]);
			const { tx, updateChain } = createTxWriteChains();
			updateChain.returning.mockResolvedValueOnce([{ id: 10 }]);
			mockDb.transaction.mockImplementationOnce(async (fn) => fn(tx));

			const event = createMockEvent({
				method: 'POST',
				params: { projectId: '1' },
				body: { action: 'moveToGroup', testCaseIds: [10, 11], groupId: 3 },
				user: testUser
			});

			await expect(POST(event)).rejects.toMatchObject({ status: 404 });
			expect(updateChain.returning).toHaveBeenCalledWith({ id: 'id' });
		});

		it('should reject moveToGroup when the group is not in the current project', async () => {
			mockDb.query.projectMember.findFirst.mockResolvedValue({ role: 'QA' });
			mockDb.query.testCaseGroup.findFirst.mockResolvedValue(null);
			mockSelectResult(mockDb, [{ id: 10 }]);

			const event = createMockEvent({
				method: 'POST',
				params: { projectId: '1' },
				body: { action: 'moveToGroup', testCaseIds: [10], groupId: 99 },
				user: testUser
			});

			const response = await POST(event);
			const data = await response.json();

			expect(response.status).toBe(404);
			expect(data.error).toBe('Test case group not found');
			expect(mockDb.transaction).not.toHaveBeenCalled();
			expect(mockDb.query.testCaseGroup.findFirst).toHaveBeenCalledWith({
				where: expect.arrayContaining([
					['id', 99],
					['project_id', 1]
				])
			});
		});

		it('should reject when only some requested test cases belong to the project', async () => {
			mockDb.query.projectMember.findFirst.mockResolvedValue({ role: 'QA' });
			mockSelectResult(mockDb, [{ id: 10 }]);

			const event = createMockEvent({
				method: 'POST',
				params: { projectId: '1' },
				body: { action: 'clone', testCaseIds: [10, 99] },
				user: testUser
			});

			const response = await POST(event);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toBe('Some test cases do not belong to this project');
			expect(mockDb.transaction).not.toHaveBeenCalled();
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
			expect(deleteChain.returning).toHaveBeenCalledWith({ id: 'id' });
		});

		it('should return 404 when bulk delete removes fewer rows than requested', async () => {
			mockDb.query.projectMember.findFirst.mockResolvedValue({ role: 'PROJECT_ADMIN' });
			mockSelectResult(mockDb, [{ id: 10 }, { id: 11 }]);
			const { tx, deleteChain } = createTxWriteChains();
			deleteChain.returning.mockResolvedValueOnce([{ id: 10 }]);
			mockDb.transaction.mockImplementationOnce(async (fn) => fn(tx));

			const event = createMockEvent({
				method: 'POST',
				params: { projectId: '1' },
				body: { action: 'delete', testCaseIds: [10, 11] },
				user: testUser
			});

			await expect(POST(event)).rejects.toMatchObject({ status: 404 });
			expect(deleteChain.returning).toHaveBeenCalledWith({ id: 'id' });
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

		it('should return 404 when setPriority latest-version update finds no row', async () => {
			mockDb.query.projectMember.findFirst.mockResolvedValue({ role: 'QA' });
			mockSelectResult(mockDb, [{ id: 10 }]);
			mockFindTestCasesWithLatestVersions.mockResolvedValue([
				{
					id: 10,
					latestVersion: {
						id: 100,
						versionNo: 1,
						title: 'Login',
						precondition: null,
						steps: [],
						expectedResult: null,
						priority: 'LOW',
						revision: 1
					}
				}
			]);

			const txInsertVersionChain = {
				values: vi.fn().mockReturnThis(),
				returning: vi.fn().mockResolvedValue([{ id: 200 }])
			};
			const txUpdateChain = {
				set: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				returning: vi.fn().mockResolvedValue([])
			};
			const tx = {
				insert: vi.fn().mockReturnValue(txInsertVersionChain),
				update: vi.fn().mockReturnValue(txUpdateChain),
				delete: vi.fn(),
				query: {
					tag: { findFirst: vi.fn() },
					priorityConfig: { findFirst: vi.fn().mockResolvedValue({ name: 'HIGH' }) },
					projectMember: { findFirst: vi.fn() }
				}
			};
			mockDb.transaction.mockImplementationOnce(async (fn) => fn(tx));

			const event = createMockEvent({
				method: 'POST',
				params: { projectId: '1' },
				body: { action: 'setPriority', testCaseIds: [10], priority: 'HIGH' },
				user: testUser
			});

			await expect(POST(event)).rejects.toMatchObject({ status: 404 });
			expect(txUpdateChain.returning).toHaveBeenCalledWith({ id: 'id' });
		});

		it('should return 404 when clone latest-version update finds no row', async () => {
			mockDb.query.projectMember.findFirst.mockResolvedValue({ role: 'QA' });
			mockSelectResult(mockDb, [{ id: 10 }]);
			mockFindTestCasesWithLatestVersions.mockResolvedValue([
				{
					id: 10,
					groupId: null,
					latestVersion: {
						id: 100,
						title: 'Login',
						precondition: null,
						steps: [],
						expectedResult: null,
						priority: 'LOW'
					}
				}
			]);

			const txMaxKeyChain = {
				from: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) => Promise.resolve([{ maxKey: 'TC-0001' }]).then(r)
			};
			const txMaxSortChain = {
				from: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) => Promise.resolve([{ maxOrder: 0 }]).then(r)
			};
			const txInsertCaseChain = {
				values: vi.fn().mockReturnThis(),
				returning: vi.fn().mockResolvedValue([{ id: 20, key: 'TC-0002' }])
			};
			const txInsertVersionChain = {
				values: vi.fn().mockReturnThis(),
				returning: vi.fn().mockResolvedValue([{ id: 200, testCaseId: 20 }])
			};
			const txUpdateChain = {
				set: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				returning: vi.fn().mockResolvedValue([])
			};
			let selectCallCount = 0;
			let insertCallCount = 0;
			const tx = {
				select: vi.fn().mockImplementation(() => {
					selectCallCount++;
					if (selectCallCount === 1) return txMaxKeyChain;
					if (selectCallCount === 2) return txMaxSortChain;
					return {
						from: vi.fn().mockReturnThis(),
						where: vi.fn().mockReturnThis(),
						then: (r: (v: unknown) => void) => Promise.resolve([]).then(r)
					};
				}),
				insert: vi.fn().mockImplementation(() => {
					insertCallCount++;
					return insertCallCount === 1 ? txInsertCaseChain : txInsertVersionChain;
				}),
				update: vi.fn().mockReturnValue(txUpdateChain),
				delete: vi.fn(),
				query: {
					tag: { findFirst: vi.fn() },
					priorityConfig: { findFirst: vi.fn() },
					projectMember: { findFirst: vi.fn() }
				}
			};
			mockDb.transaction.mockImplementationOnce(async (fn) => fn(tx));

			const event = createMockEvent({
				method: 'POST',
				params: { projectId: '1' },
				body: { action: 'clone', testCaseIds: [10] },
				user: testUser
			});

			await expect(POST(event)).rejects.toMatchObject({ status: 404 });
			expect(txUpdateChain.returning).toHaveBeenCalledWith({ id: 'id' });
		});
	});
});
