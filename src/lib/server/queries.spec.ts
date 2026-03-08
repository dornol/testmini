import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockSelectResult } from '$lib/server/test-helpers/mock-db';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	tag: { id: 'tag.id', name: 'tag.name', color: 'tag.color', projectId: 'tag.project_id' },
	testCaseTag: { tagId: 'tct.tag_id', testCaseId: 'tct.test_case_id' },
	testCaseAssignee: { userId: 'tca.user_id', testCaseId: 'tca.test_case_id' },
	projectMember: { userId: 'pm.user_id', projectId: 'pm.project_id' },
	user: { id: 'user.id', name: 'user.name', image: 'user.image' },
	priorityConfig: {
		id: 'pc.id',
		name: 'pc.name',
		color: 'pc.color',
		position: 'pc.position',
		isDefault: 'pc.is_default',
		projectId: 'pc.project_id'
	},
	environmentConfig: {
		id: 'ec.id',
		name: 'ec.name',
		color: 'ec.color',
		position: 'ec.position',
		isDefault: 'ec.is_default',
		projectId: 'ec.project_id'
	}
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	asc: vi.fn((a: unknown) => ['asc', a]),
	inArray: vi.fn((a: unknown, b: unknown) => ['inArray', a, b])
}));

const {
	loadTestCaseTags,
	loadProjectTags,
	loadTestCaseAssignees,
	loadProjectMembers,
	loadProjectPriorities,
	loadProjectEnvironments,
	loadTestCaseMetadata
} = await import('./queries');

describe('queries', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// ── loadTestCaseTags ──────────────────────────────────

	describe('loadTestCaseTags', () => {
		it('should return tags for a test case', async () => {
			const tags = [
				{ id: 1, name: 'smoke', color: '#ff0000' },
				{ id: 2, name: 'regression', color: '#00ff00' }
			];
			mockSelectResult(mockDb, tags);

			const result = await loadTestCaseTags(10);

			expect(result).toEqual(tags);
			expect(mockDb.select).toHaveBeenCalledTimes(1);
		});

		it('should return empty array when no tags assigned', async () => {
			mockSelectResult(mockDb, []);

			const result = await loadTestCaseTags(999);

			expect(result).toEqual([]);
		});

		it('should call select with correct column shape', async () => {
			mockSelectResult(mockDb, []);

			await loadTestCaseTags(10);

			expect(mockDb.select).toHaveBeenCalledWith({
				id: 'tag.id',
				name: 'tag.name',
				color: 'tag.color'
			});
		});
	});

	// ── loadProjectTags ───────────────────────────────────

	describe('loadProjectTags', () => {
		it('should return tags for a project', async () => {
			const tags = [
				{ id: 1, name: 'api', color: '#0000ff' },
				{ id: 2, name: 'ui', color: '#ff00ff' }
			];
			mockSelectResult(mockDb, tags);

			const result = await loadProjectTags(1);

			expect(result).toEqual(tags);
			expect(mockDb.select).toHaveBeenCalledTimes(1);
		});

		it('should return empty array when project has no tags', async () => {
			mockSelectResult(mockDb, []);

			const result = await loadProjectTags(999);

			expect(result).toEqual([]);
		});

		it('should call select with correct column shape', async () => {
			mockSelectResult(mockDb, []);

			await loadProjectTags(1);

			expect(mockDb.select).toHaveBeenCalledWith({
				id: 'tag.id',
				name: 'tag.name',
				color: 'tag.color'
			});
		});
	});

	// ── loadTestCaseAssignees ─────────────────────────────

	describe('loadTestCaseAssignees', () => {
		it('should return assignees for a test case', async () => {
			const assignees = [
				{ userId: 'user-1', userName: 'Alice', userImage: null },
				{ userId: 'user-2', userName: 'Bob', userImage: 'https://img.example.com/bob.png' }
			];
			mockSelectResult(mockDb, assignees);

			const result = await loadTestCaseAssignees(10);

			expect(result).toEqual(assignees);
			expect(mockDb.select).toHaveBeenCalledTimes(1);
		});

		it('should return empty array when no assignees', async () => {
			mockSelectResult(mockDb, []);

			const result = await loadTestCaseAssignees(999);

			expect(result).toEqual([]);
		});

		it('should call select with correct column shape', async () => {
			mockSelectResult(mockDb, []);

			await loadTestCaseAssignees(10);

			expect(mockDb.select).toHaveBeenCalledWith({
				userId: 'tca.user_id',
				userName: 'user.name',
				userImage: 'user.image'
			});
		});
	});

	// ── loadProjectMembers ────────────────────────────────

	describe('loadProjectMembers', () => {
		it('should return members for a project', async () => {
			const members = [
				{ userId: 'user-1', userName: 'Alice', userImage: null },
				{ userId: 'user-2', userName: 'Bob', userImage: 'https://img.example.com/bob.png' }
			];
			mockSelectResult(mockDb, members);

			const result = await loadProjectMembers(1);

			expect(result).toEqual(members);
			expect(mockDb.select).toHaveBeenCalledTimes(1);
		});

		it('should return empty array when project has no members', async () => {
			mockSelectResult(mockDb, []);

			const result = await loadProjectMembers(999);

			expect(result).toEqual([]);
		});

		it('should call select with correct column shape', async () => {
			mockSelectResult(mockDb, []);

			await loadProjectMembers(1);

			expect(mockDb.select).toHaveBeenCalledWith({
				userId: 'pm.user_id',
				userName: 'user.name',
				userImage: 'user.image'
			});
		});
	});

	// ── loadProjectPriorities ─────────────────────────────

	describe('loadProjectPriorities', () => {
		it('should return priorities ordered by position', async () => {
			const priorities = [
				{ id: 1, name: 'LOW', color: '#6b7280', position: 0, isDefault: false },
				{ id: 2, name: 'MEDIUM', color: '#3b82f6', position: 1, isDefault: true },
				{ id: 3, name: 'HIGH', color: '#f97316', position: 2, isDefault: false }
			];
			mockSelectResult(mockDb, priorities);

			const result = await loadProjectPriorities(1);

			expect(result).toEqual(priorities);
			expect(mockDb.select).toHaveBeenCalledTimes(1);
		});

		it('should return empty array when project has no priorities', async () => {
			mockSelectResult(mockDb, []);

			const result = await loadProjectPriorities(999);

			expect(result).toEqual([]);
		});

		it('should call select with correct column shape', async () => {
			mockSelectResult(mockDb, []);

			await loadProjectPriorities(1);

			expect(mockDb.select).toHaveBeenCalledWith({
				id: 'pc.id',
				name: 'pc.name',
				color: 'pc.color',
				position: 'pc.position',
				isDefault: 'pc.is_default'
			});
		});
	});

	// ── loadProjectEnvironments ───────────────────────────

	describe('loadProjectEnvironments', () => {
		it('should return environments ordered by position', async () => {
			const envs = [
				{ id: 1, name: 'DEV', color: '#22c55e', position: 0, isDefault: true },
				{ id: 2, name: 'QA', color: '#3b82f6', position: 1, isDefault: false },
				{ id: 3, name: 'PROD', color: '#ef4444', position: 2, isDefault: false }
			];
			mockSelectResult(mockDb, envs);

			const result = await loadProjectEnvironments(1);

			expect(result).toEqual(envs);
			expect(mockDb.select).toHaveBeenCalledTimes(1);
		});

		it('should return empty array when project has no environments', async () => {
			mockSelectResult(mockDb, []);

			const result = await loadProjectEnvironments(999);

			expect(result).toEqual([]);
		});

		it('should call select with correct column shape', async () => {
			mockSelectResult(mockDb, []);

			await loadProjectEnvironments(1);

			expect(mockDb.select).toHaveBeenCalledWith({
				id: 'ec.id',
				name: 'ec.name',
				color: 'ec.color',
				position: 'ec.position',
				isDefault: 'ec.is_default'
			});
		});
	});

	// ── loadTestCaseMetadata ──────────────────────────────

	describe('loadTestCaseMetadata', () => {
		it('should return combined metadata from all sub-queries', async () => {
			const tags = [{ id: 1, name: 'smoke', color: '#ff0000' }];
			const projectTags = [{ id: 1, name: 'smoke', color: '#ff0000' }, { id: 2, name: 'api', color: '#0000ff' }];
			const assignees = [{ userId: 'user-1', userName: 'Alice', userImage: null }];
			const members = [{ userId: 'user-1', userName: 'Alice', userImage: null }, { userId: 'user-2', userName: 'Bob', userImage: null }];

			// loadTestCaseMetadata calls 4 functions in parallel via Promise.all
			// Each call invokes db.select(), so we build separate chainable mocks
			// and return them sequentially
			function makeChain(result: unknown[]) {
				const chain: Record<string, unknown> = {};
				for (const m of ['from', 'where', 'orderBy', 'innerJoin', 'leftJoin']) {
					chain[m] = vi.fn().mockReturnValue(chain);
				}
				chain.then = (resolve: (v: unknown) => void) => Promise.resolve(result).then(resolve);
				return chain;
			}

			mockDb.select
				.mockReturnValueOnce(makeChain(tags))
				.mockReturnValueOnce(makeChain(projectTags))
				.mockReturnValueOnce(makeChain(assignees))
				.mockReturnValueOnce(makeChain(members));

			const result = await loadTestCaseMetadata(10, 1);

			expect(result).toEqual({
				assignedTags: tags,
				projectTags: projectTags,
				assignedAssignees: assignees,
				projectMembers: members
			});
			expect(mockDb.select).toHaveBeenCalledTimes(4);
		});

		it('should return empty arrays when no data exists', async () => {
			mockSelectResult(mockDb, []);

			const result = await loadTestCaseMetadata(999, 999);

			expect(result).toEqual({
				assignedTags: [],
				projectTags: [],
				assignedAssignees: [],
				projectMembers: []
			});
		});
	});
});
