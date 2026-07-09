import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockSelectResult } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { adminUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb, col: mockDb.col, sql: mockDb.sql }));
vi.mock('$lib/server/db/schema', () => ({
	testCase: { id: 'id', projectId: 'project_id', groupId: 'group_id', sortOrder: 'sort_order' }
}));
vi.mock('drizzle-orm', () => ({
	and: vi.fn((...args: unknown[]) => args),
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	inArray: vi.fn((a: unknown, b: unknown) => ['inArray', a, b])
}));
vi.mock('$lib/server/auth-utils', async () => {
	const actual =
		await vi.importActual<typeof import('$lib/server/auth-utils')>('$lib/server/auth-utils');
	return {
		...actual,
		requireProjectRole: vi.fn().mockResolvedValue({ role: 'PROJECT_ADMIN' })
	};
});

const { PUT } = await import('./+server');
const authUtils = await import('$lib/server/auth-utils');

const PARAMS = { projectId: '1' };

describe('/api/projects/[projectId]/test-cases/reorder', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(authUtils.requireProjectRole).mockResolvedValue({ role: 'PROJECT_ADMIN' });
	});

	describe('PUT', () => {
		it('should return 400 when body is not an object', async () => {
			const event = createMockEvent({
				method: 'PUT',
				params: PARAMS,
				body: null,
				user: adminUser
			});
			const response = await PUT(event);

			expect(response.status).toBe(400);
			const data = await response.json();
			expect(data.error).toContain('Invalid request body');
		});

		it('should return 400 when items is not an array', async () => {
			const event = createMockEvent({
				method: 'PUT',
				params: PARAMS,
				body: { items: 'not-array' },
				user: adminUser
			});
			const response = await PUT(event);

			expect(response.status).toBe(400);
			const data = await response.json();
			expect(data.error).toContain('items array is required');
		});

		it('should return 400 when item is not an object', async () => {
			const event = createMockEvent({
				method: 'PUT',
				params: PARAMS,
				body: { items: [123] },
				user: adminUser
			});
			const response = await PUT(event);

			expect(response.status).toBe(400);
			const data = await response.json();
			expect(data.error).toContain('items 1 must be an object');
		});

		it('should return 400 for invalid item id', async () => {
			const cases = [
				'abc',
				0,
				-1,
				1.5,
				Number.MAX_SAFE_INTEGER + 1,
				'+1',
				'01',
				'1.5',
				'1e3',
				' 1',
				'1 ',
				{}
			];

			for (const id of cases) {
				vi.clearAllMocks();
				vi.mocked(authUtils.requireProjectRole).mockResolvedValue({ role: 'PROJECT_ADMIN' });

				const event = createMockEvent({
					method: 'PUT',
					params: PARAMS,
					body: { items: [{ id, groupId: null, sortOrder: 0 }] },
					user: adminUser
				});
				const response = await PUT(event);

				expect(response.status).toBe(400);
				const data = await response.json();
				expect(data.error).toContain('id must be a positive integer');
				expect(mockDb.select).not.toHaveBeenCalled();
				expect(mockDb.transaction).not.toHaveBeenCalled();
			}
		});

		it('should return 400 for invalid groupId', async () => {
			const cases = [
				'abc',
				0,
				-1,
				1.5,
				Number.MAX_SAFE_INTEGER + 1,
				'+1',
				'01',
				'1.5',
				'1e3',
				' 1',
				'1 ',
				{}
			];

			for (const groupId of cases) {
				vi.clearAllMocks();
				vi.mocked(authUtils.requireProjectRole).mockResolvedValue({ role: 'PROJECT_ADMIN' });

				const event = createMockEvent({
					method: 'PUT',
					params: PARAMS,
					body: { items: [{ id: 10, groupId, sortOrder: 0 }] },
					user: adminUser
				});
				const response = await PUT(event);

				expect(response.status).toBe(400);
				const data = await response.json();
				expect(data.error).toContain('groupId must be a positive integer');
				expect(mockDb.select).not.toHaveBeenCalled();
				expect(mockDb.transaction).not.toHaveBeenCalled();
			}
		});

		it('should return 400 for invalid sortOrder', async () => {
			const cases = ['abc', -5, 1.5, Number.MAX_SAFE_INTEGER + 1];

			for (const sortOrder of cases) {
				vi.clearAllMocks();
				vi.mocked(authUtils.requireProjectRole).mockResolvedValue({ role: 'PROJECT_ADMIN' });

				const event = createMockEvent({
					method: 'PUT',
					params: PARAMS,
					body: { items: [{ id: 10, groupId: null, sortOrder }] },
					user: adminUser
				});
				const response = await PUT(event);

				expect(response.status).toBe(400);
				const data = await response.json();
				expect(data.error).toBe('sortOrder must be a non-negative integer');
				expect(mockDb.select).not.toHaveBeenCalled();
				expect(mockDb.transaction).not.toHaveBeenCalled();
			}
		});

		it('should return 400 for duplicate item ids', async () => {
			const event = createMockEvent({
				method: 'PUT',
				params: PARAMS,
				body: {
					items: [
						{ id: 10, groupId: null, sortOrder: 0 },
						{ id: 10, groupId: null, sortOrder: 1 }
					]
				},
				user: adminUser
			});
			const response = await PUT(event);

			expect(response.status).toBe(400);
			const data = await response.json();
			expect(data.error).toContain('duplicate ids');
		});

		it('should return 400 when items is too large', async () => {
			const event = createMockEvent({
				method: 'PUT',
				params: PARAMS,
				body: {
					items: Array.from({ length: 1001 }, (_, i) => ({
						id: i + 1,
						groupId: null,
						sortOrder: i
					}))
				},
				user: adminUser
			});
			const response = await PUT(event);

			expect(response.status).toBe(400);
			const data = await response.json();
			expect(data.error).toContain('1000 items or less');
		});

		it('should return 400 when test cases do not belong to project', async () => {
			// Return fewer items than requested, simulating some not belonging to the project
			mockSelectResult(mockDb, [{ id: 10 }]);

			const event = createMockEvent({
				method: 'PUT',
				params: PARAMS,
				body: {
					items: [
						{ id: 10, groupId: null, sortOrder: 0 },
						{ id: 999, groupId: null, sortOrder: 1 }
					]
				},
				user: adminUser
			});
			const response = await PUT(event);

			expect(response.status).toBe(400);
			const data = await response.json();
			expect(data.error).toBe('Some test cases do not belong to this project');
		});
	});
});
