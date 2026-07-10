import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	createMockDb,
	mockDeleteReturning,
	mockSelectResult
} from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { adminUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();
// The items endpoint uses db.query.testSuite.findFirst
(mockDb.query as Record<string, unknown>).testSuite = { findFirst: vi.fn() };

vi.mock('$lib/server/db', () => ({ db: mockDb, col: mockDb.col, sql: mockDb.sql }));
vi.mock('$lib/server/db/schema', () => ({
	testSuite: { id: 'id', projectId: 'project_id' },
	testSuiteItem: { id: 'id', suiteId: 'suite_id', testCaseId: 'test_case_id' },
	testCase: { id: 'id', projectId: 'project_id' }
}));
vi.mock('drizzle-orm', () => ({
	and: vi.fn((...args: unknown[]) => args),
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	inArray: vi.fn((a: unknown, b: unknown) => ['inArray', a, b]),
	sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }))
}));
vi.mock('$lib/server/auth-utils', async () => {
	const actual =
		await vi.importActual<typeof import('$lib/server/auth-utils')>('$lib/server/auth-utils');
	return {
		...actual,
		requireProjectRole: vi.fn().mockResolvedValue({ role: 'PROJECT_ADMIN' })
	};
});

const { POST, DELETE } = await import('./+server');
const authUtils = await import('$lib/server/auth-utils');

const PARAMS = { projectId: '1', suiteId: '5' };

describe('/api/projects/[projectId]/test-suites/[suiteId]/items', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(authUtils.requireProjectRole).mockResolvedValue({ role: 'PROJECT_ADMIN' });
		// Default: suite exists
		vi.mocked(
			(mockDb.query as Record<string, { findFirst: ReturnType<typeof vi.fn> }>).testSuite.findFirst
		).mockResolvedValue({ id: 5, projectId: 1 });
	});

	describe('POST', () => {
		it('should return 400 when body is not an object', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: null,
				user: adminUser
			});
			const response = await POST(event);

			expect(response.status).toBe(400);
			const data = await response.json();
			expect(data.error).toContain('Invalid request body');
		});

		it('should return 400 when testCaseIds is empty', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { testCaseIds: [] },
				user: adminUser
			});
			const response = await POST(event);

			expect(response.status).toBe(400);
			const data = await response.json();
			expect(data.error).toContain('testCaseIds must be a non-empty array');
		});

		it('should return 400 when testCaseIds contains duplicates', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { testCaseIds: [10, 10] },
				user: adminUser
			});
			const response = await POST(event);

			expect(response.status).toBe(400);
			const data = await response.json();
			expect(data.error).toContain('duplicates');
		});

		it('should return 400 when body has unknown fields', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { testCaseIds: [10], append: true },
				user: adminUser
			});
			const response = await POST(event);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toContain('Invalid suite item field');
			expect(mockDb.insert).not.toHaveBeenCalled();
		});

		it('should return 400 when test cases do not belong to project', async () => {
			// Return fewer test cases than requested, simulating some not belonging to the project
			mockSelectResult(mockDb, [{ id: 10 }]);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { testCaseIds: [10, 999] },
				user: adminUser
			});
			const response = await POST(event);

			expect(response.status).toBe(400);
			const data = await response.json();
			expect(data.error).toBe('Some test cases do not belong to this project');
		});

		it('should add test cases with one conflict-safe insert', async () => {
			mockSelectResult(mockDb, [{ id: 10 }, { id: 11 }]);
			const returning = vi.fn().mockResolvedValue([{ id: 1 }, { id: 2 }]);
			const onConflictDoNothing = vi.fn(() => ({ returning }));
			const values = vi.fn(() => ({ onConflictDoNothing }));
			mockDb.insert.mockReturnValue({ values } as never);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { testCaseIds: [10, 11] },
				user: adminUser
			});

			const response = await POST(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.success).toBe(true);
			expect(data.added).toBe(2);
			expect(mockDb.insert).toHaveBeenCalledTimes(1);
			expect(mockDb.insert).toHaveBeenCalledWith(expect.objectContaining({ suiteId: 'suite_id' }));
			expect(values).toHaveBeenCalledWith([
				{ suiteId: 5, testCaseId: 10 },
				{ suiteId: 5, testCaseId: 11 }
			]);
			expect(onConflictDoNothing).toHaveBeenCalledTimes(1);
			expect(returning).toHaveBeenCalledWith({ id: 'id' });
		});

		it('should report zero added when all suite items already exist', async () => {
			mockSelectResult(mockDb, [{ id: 10 }, { id: 11 }]);
			const returning = vi.fn().mockResolvedValue([]);
			const onConflictDoNothing = vi.fn(() => ({ returning }));
			const values = vi.fn(() => ({ onConflictDoNothing }));
			mockDb.insert.mockReturnValue({ values } as never);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { testCaseIds: [10, 11] },
				user: adminUser
			});

			const response = await POST(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data).toEqual({ success: true, added: 0 });
		});
	});

	describe('DELETE', () => {
		it('should return 400 when body has unknown fields', async () => {
			const event = createMockEvent({
				method: 'DELETE',
				params: PARAMS,
				body: { testCaseIds: [10], force: true },
				user: adminUser
			});
			const response = await DELETE(event);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toContain('Invalid suite item field');
			expect(mockDb.delete).not.toHaveBeenCalled();
		});

		it('should return 400 when testCaseIds contains duplicates', async () => {
			const event = createMockEvent({
				method: 'DELETE',
				params: PARAMS,
				body: { testCaseIds: [10, 10] },
				user: adminUser
			});
			const response = await DELETE(event);

			expect(response.status).toBe(400);
			const data = await response.json();
			expect(data.error).toContain('duplicates');
		});

		it('should remove test cases from suite', async () => {
			mockSelectResult(mockDb, [{ id: 10 }, { id: 11 }]);
			const deleteChain = mockDeleteReturning(mockDb, [{ id: 1 }]);

			const event = createMockEvent({
				method: 'DELETE',
				params: PARAMS,
				body: { testCaseIds: [10, 11] },
				user: adminUser
			});
			const response = await DELETE(event);

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.success).toBe(true);
			expect(data.removed).toBe(1);
			expect(deleteChain.where).toHaveBeenCalledWith(
				expect.arrayContaining([
					['suite_id', 5],
					['inArray', 'test_case_id', [10, 11]],
					expect.objectContaining({ values: [5, 1] })
				])
			);
			expect(deleteChain.returning).toHaveBeenCalledWith({ id: 'id' });
		});

		it('should report zero removed when suite items are already gone', async () => {
			mockSelectResult(mockDb, [{ id: 10 }, { id: 11 }]);
			mockDeleteReturning(mockDb, []);

			const event = createMockEvent({
				method: 'DELETE',
				params: PARAMS,
				body: { testCaseIds: [10, 11] },
				user: adminUser
			});
			const response = await DELETE(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.success).toBe(true);
			expect(data.removed).toBe(0);
		});

		it('should return 400 when delete test cases do not belong to project', async () => {
			mockSelectResult(mockDb, [{ id: 10 }]);

			const event = createMockEvent({
				method: 'DELETE',
				params: PARAMS,
				body: { testCaseIds: [10, 999] },
				user: adminUser
			});
			const response = await DELETE(event);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toBe('Some test cases do not belong to this project');
			expect(mockDb.delete).not.toHaveBeenCalled();
		});
	});
});
