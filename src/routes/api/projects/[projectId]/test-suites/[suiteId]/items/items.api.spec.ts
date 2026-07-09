import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockSelectResult } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { adminUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();
// The items endpoint uses db.query.testSuite.findFirst
(mockDb.query as Record<string, unknown>).testSuite = { findFirst: vi.fn() };

vi.mock('$lib/server/db', () => ({ db: mockDb, col: mockDb.col, sql: mockDb.sql }));
vi.mock('$lib/server/db/schema', () => ({
	testSuite: { id: 'id', projectId: 'project_id' },
	testSuiteItem: { suiteId: 'suite_id', testCaseId: 'test_case_id' },
	testCase: { id: 'id', projectId: 'project_id' }
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
	});

	describe('DELETE', () => {
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
			const deleteChain = {
				where: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) => Promise.resolve(undefined).then(r)
			};
			mockDb.delete.mockReturnValue(deleteChain as never);

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
		});
	});
});
