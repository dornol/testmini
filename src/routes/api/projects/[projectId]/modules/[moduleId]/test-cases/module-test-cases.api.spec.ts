import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockInsertReturning } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	module: { id: 'id', projectId: 'project_id', name: 'name' },
	moduleTestCase: { id: 'id', moduleId: 'module_id', testCaseId: 'test_case_id' }
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	and: vi.fn((...args: unknown[]) => args),
	inArray: vi.fn((a: unknown, b: unknown) => [a, b])
}));
vi.mock('$lib/server/auth-utils', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/auth-utils')>('$lib/server/auth-utils');
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

		it('should add test cases to module on success', async () => {
			mockDb.query.module.findFirst.mockResolvedValue({ id: 5, projectId: 1 });
			const insertChain = {
				values: vi.fn().mockReturnThis(),
				onConflictDoNothing: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) => Promise.resolve(undefined).then(r)
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

		it('should remove test cases from module on success', async () => {
			mockDb.query.module.findFirst.mockResolvedValue({ id: 5, projectId: 1 });
			const deleteChain = {
				where: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) => Promise.resolve(undefined).then(r)
			};
			mockDb.delete.mockReturnValue(deleteChain as never);

			const event = createMockEvent({
				method: 'DELETE',
				params: PARAMS,
				body: { testCaseIds: [1, 2] },
				user: testUser
			});
			const response = await DELETE(event);
			expect(response.status).toBe(200);
			const body = await response.json();
			expect(body.removed).toBe(2);
		});
	});
});
