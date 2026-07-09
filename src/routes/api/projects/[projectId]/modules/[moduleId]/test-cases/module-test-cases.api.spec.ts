import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	createMockDb,
	mockDeleteReturning,
	mockInsertReturning,
	mockSelectResult
} from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb, col: mockDb.col, sql: mockDb.sql }));
vi.mock('$lib/server/db/schema', () => ({
	module: { id: 'id', projectId: 'project_id', name: 'name' },
	testCase: { id: 'id', projectId: 'project_id' },
	moduleTestCase: { id: 'id', moduleId: 'module_id', testCaseId: 'test_case_id' }
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	and: vi.fn((...args: unknown[]) => args),
	inArray: vi.fn((a: unknown, b: unknown) => [a, b])
}));
vi.mock('$lib/server/auth-utils', async () => {
	const actual =
		await vi.importActual<typeof import('$lib/server/auth-utils')>('$lib/server/auth-utils');
	return {
		...actual,
		requireProjectAccess: vi.fn().mockResolvedValue({ role: 'QA' }),
		requireProjectRole: vi.fn().mockResolvedValue({ role: 'QA' })
	};
});

const { POST, DELETE } = await import('./+server');

const PARAMS = { projectId: '1', moduleId: '5' };

describe('/api/projects/[projectId]/modules/[moduleId]/test-cases', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('POST', () => {
		it('should return 401 when not authenticated', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { testCaseIds: [1, 2] },
				user: null
			});
			await expect(POST(event)).rejects.toThrow();
		});

		it('should return 404 when module not found', async () => {
			mockDb.query.module.findFirst.mockResolvedValue(null);
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { testCaseIds: [1, 2] },
				user: testUser
			});
			const response = await POST(event);
			expect(response.status).toBe(404);
		});

		it('should return 400 when testCaseIds is empty', async () => {
			mockDb.query.module.findFirst.mockResolvedValue({ id: 5, projectId: 1 });
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { testCaseIds: [] },
				user: testUser
			});
			const response = await POST(event);
			expect(response.status).toBe(400);
		});

		it('should return 400 when testCaseIds is missing', async () => {
			mockDb.query.module.findFirst.mockResolvedValue({ id: 5, projectId: 1 });
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: {},
				user: testUser
			});
			const response = await POST(event);
			expect(response.status).toBe(400);
		});

		it('should return 400 when body is not an object', async () => {
			mockDb.query.module.findFirst.mockResolvedValue({ id: 5, projectId: 1 });
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: null,
				user: testUser
			});
			const response = await POST(event);
			expect(response.status).toBe(400);
			expect((await response.json()).error).toContain('Invalid request body');
		});

		it('should return 400 when testCaseIds contains invalid ids', async () => {
			mockDb.query.module.findFirst.mockResolvedValue({ id: 5, projectId: 1 });
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { testCaseIds: [1, 0] },
				user: testUser
			});
			const response = await POST(event);
			expect(response.status).toBe(400);
			expect((await response.json()).error).toContain('positive integer');
		});

		it('should return 400 when testCaseIds contains duplicates', async () => {
			mockDb.query.module.findFirst.mockResolvedValue({ id: 5, projectId: 1 });
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { testCaseIds: [1, 1] },
				user: testUser
			});
			const response = await POST(event);
			expect(response.status).toBe(400);
			expect((await response.json()).error).toContain('duplicates');
		});

		it('should add test cases to module on success', async () => {
			mockDb.query.module.findFirst.mockResolvedValue({ id: 5, projectId: 1 });
			mockSelectResult(mockDb, [{ id: 1 }, { id: 2 }, { id: 3 }]);
			const insertChain = {
				values: vi.fn().mockReturnThis(),
				onConflictDoNothing: vi.fn().mockReturnThis(),
				returning: vi.fn().mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }])
			};
			mockDb.insert.mockReturnValue(insertChain as never);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { testCaseIds: [1, 2, 3] },
				user: testUser
			});
			const response = await POST(event);
			expect(response.status).toBe(200);
			const body = await response.json();
			expect(body.added).toBe(3);
		});

		it('should report zero added when all module links already exist', async () => {
			mockDb.query.module.findFirst.mockResolvedValue({ id: 5, projectId: 1 });
			mockSelectResult(mockDb, [{ id: 1 }, { id: 2 }]);
			const insertChain = {
				values: vi.fn().mockReturnThis(),
				onConflictDoNothing: vi.fn().mockReturnThis(),
				returning: vi.fn().mockResolvedValue([])
			};
			mockDb.insert.mockReturnValue(insertChain as never);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { testCaseIds: [1, 2] },
				user: testUser
			});
			const response = await POST(event);
			const body = await response.json();

			expect(response.status).toBe(200);
			expect(body.added).toBe(0);
		});

		it('should reject test cases outside the current project', async () => {
			mockDb.query.module.findFirst.mockResolvedValue({ id: 5, projectId: 1 });
			mockSelectResult(mockDb, [{ id: 1 }]);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { testCaseIds: [1, 2] },
				user: testUser
			});
			const response = await POST(event);
			const body = await response.json();

			expect(response.status).toBe(400);
			expect(body.error).toContain('Some test cases do not belong to this project');
			expect(mockDb.insert).not.toHaveBeenCalled();
		});

		it('should return 400 for invalid module ID', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: { projectId: '1', moduleId: 'abc' },
				body: { testCaseIds: [1] },
				user: testUser
			});
			const response = await POST(event);
			expect(response.status).toBe(400);
		});

		it('should return 400 for zero module ID', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: { projectId: '1', moduleId: '0' },
				body: { testCaseIds: [1] },
				user: testUser
			});
			const response = await POST(event);
			expect(response.status).toBe(400);
		});
	});

	describe('DELETE', () => {
		it('should return 401 when not authenticated', async () => {
			const event = createMockEvent({
				method: 'DELETE',
				params: PARAMS,
				body: { testCaseIds: [1] },
				user: null
			});
			await expect(DELETE(event)).rejects.toThrow();
		});

		it('should return 404 when module not found', async () => {
			mockDb.query.module.findFirst.mockResolvedValue(null);
			const event = createMockEvent({
				method: 'DELETE',
				params: PARAMS,
				body: { testCaseIds: [1] },
				user: testUser
			});
			const response = await DELETE(event);
			expect(response.status).toBe(404);
		});

		it('should return 400 when testCaseIds is empty', async () => {
			mockDb.query.module.findFirst.mockResolvedValue({ id: 5, projectId: 1 });
			const event = createMockEvent({
				method: 'DELETE',
				params: PARAMS,
				body: { testCaseIds: [] },
				user: testUser
			});
			const response = await DELETE(event);
			expect(response.status).toBe(400);
		});

		it('should return 400 when delete body is not an object', async () => {
			mockDb.query.module.findFirst.mockResolvedValue({ id: 5, projectId: 1 });
			const event = createMockEvent({
				method: 'DELETE',
				params: PARAMS,
				body: null,
				user: testUser
			});
			const response = await DELETE(event);
			expect(response.status).toBe(400);
			expect((await response.json()).error).toContain('Invalid request body');
		});

		it('should return 400 when delete ids contain duplicates', async () => {
			mockDb.query.module.findFirst.mockResolvedValue({ id: 5, projectId: 1 });
			const event = createMockEvent({
				method: 'DELETE',
				params: PARAMS,
				body: { testCaseIds: [1, 1] },
				user: testUser
			});
			const response = await DELETE(event);
			expect(response.status).toBe(400);
			expect((await response.json()).error).toContain('duplicates');
		});

		it('should remove test cases from module on success', async () => {
			mockDb.query.module.findFirst.mockResolvedValue({ id: 5, projectId: 1 });
			mockSelectResult(mockDb, [{ id: 1 }, { id: 2 }]);
			const deleteChain = mockDeleteReturning(mockDb, [{ id: 1 }]);

			const event = createMockEvent({
				method: 'DELETE',
				params: PARAMS,
				body: { testCaseIds: [1, 2] },
				user: testUser
			});
			const response = await DELETE(event);
			expect(response.status).toBe(200);
			const body = await response.json();
			expect(body.removed).toBe(1);
			expect(deleteChain.returning).toHaveBeenCalledWith({ id: 'id' });
		});

		it('should report zero removed when module links are already gone', async () => {
			mockDb.query.module.findFirst.mockResolvedValue({ id: 5, projectId: 1 });
			mockSelectResult(mockDb, [{ id: 1 }, { id: 2 }]);
			mockDeleteReturning(mockDb, []);

			const event = createMockEvent({
				method: 'DELETE',
				params: PARAMS,
				body: { testCaseIds: [1, 2] },
				user: testUser
			});
			const response = await DELETE(event);
			const body = await response.json();

			expect(response.status).toBe(200);
			expect(body.removed).toBe(0);
		});

		it('should reject removing test cases outside the current project', async () => {
			mockDb.query.module.findFirst.mockResolvedValue({ id: 5, projectId: 1 });
			mockSelectResult(mockDb, []);

			const event = createMockEvent({
				method: 'DELETE',
				params: PARAMS,
				body: { testCaseIds: [99] },
				user: testUser
			});
			const response = await DELETE(event);
			const body = await response.json();

			expect(response.status).toBe(400);
			expect(body.error).toContain('Some test cases do not belong to this project');
			expect(mockDb.delete).not.toHaveBeenCalled();
		});
	});
});
