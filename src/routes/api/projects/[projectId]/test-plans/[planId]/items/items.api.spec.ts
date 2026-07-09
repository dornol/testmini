import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	createMockDb,
	mockDeleteReturning,
	mockSelectResult
} from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { adminUser, testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();
// The items endpoint uses db.query.testPlan.findFirst
(mockDb.query as Record<string, unknown>).testPlan = { findFirst: vi.fn() };

vi.mock('$lib/server/db', () => ({ db: mockDb, col: mockDb.col, sql: mockDb.sql }));
vi.mock('$lib/server/db/schema', () => ({
	testPlan: { id: 'id', projectId: 'project_id' },
	testPlanTestCase: {
		id: 'id',
		testPlanId: 'test_plan_id',
		testCaseId: 'test_case_id',
		position: 'position'
	},
	testCase: { id: 'id', projectId: 'project_id' }
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

const PARAMS = { projectId: '1', planId: '1' };

describe('/api/projects/[projectId]/test-plans/[planId]/items', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(authUtils.requireProjectRole).mockResolvedValue({ role: 'PROJECT_ADMIN' });
		// Default: plan exists
		vi.mocked(
			(mockDb.query as Record<string, { findFirst: ReturnType<typeof vi.fn> }>).testPlan.findFirst
		).mockResolvedValue({ id: 1, projectId: 1 });
	});

	describe('POST', () => {
		it('should add test cases to plan', async () => {
			// Mock validation query: all test cases belong to project
			mockSelectResult(mockDb, [{ id: 10 }, { id: 11 }]);

			// Mock max position query
			let selectCall = 0;
			mockDb.select.mockImplementation(() => {
				selectCall++;
				if (selectCall === 1) {
					// validation query
					return {
						from: vi.fn().mockReturnThis(),
						where: vi.fn().mockReturnThis(),
						then: (r: (v: unknown) => void) => Promise.resolve([{ id: 10 }, { id: 11 }]).then(r)
					} as never;
				} else {
					// max position query
					return {
						from: vi.fn().mockReturnThis(),
						where: vi.fn().mockReturnThis(),
						then: (r: (v: unknown) => void) => Promise.resolve([{ maxPosition: 2 }]).then(r)
					} as never;
				}
			});

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
			expect(mockDb.insert).toHaveBeenCalledWith(
				expect.objectContaining({ testPlanId: 'test_plan_id' })
			);
			expect(values).toHaveBeenCalledWith([
				{ testPlanId: 1, testCaseId: 10, position: 3 },
				{ testPlanId: 1, testCaseId: 11, position: 4 }
			]);
			expect(onConflictDoNothing).toHaveBeenCalledTimes(1);
			expect(returning).toHaveBeenCalledWith({ id: 'id' });
		});

		it('should report zero added when all plan items already exist', async () => {
			let selectCall = 0;
			mockDb.select.mockImplementation(() => {
				selectCall++;
				if (selectCall === 1) {
					return {
						from: vi.fn().mockReturnThis(),
						where: vi.fn().mockReturnThis(),
						then: (r: (v: unknown) => void) => Promise.resolve([{ id: 10 }, { id: 11 }]).then(r)
					} as never;
				}
				return {
					from: vi.fn().mockReturnThis(),
					where: vi.fn().mockReturnThis(),
					then: (r: (v: unknown) => void) => Promise.resolve([{ maxPosition: 2 }]).then(r)
				} as never;
			});
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

		it('should return 400 when test cases do not belong to project', async () => {
			// Return fewer test cases than requested
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

		it('should return 404 when plan not found', async () => {
			vi.mocked(
				(mockDb.query as Record<string, { findFirst: ReturnType<typeof vi.fn> }>).testPlan.findFirst
			).mockResolvedValue(null);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { testCaseIds: [10] },
				user: adminUser
			});
			await expect(POST(event)).rejects.toThrow();
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

		it('should return 400 when testCaseIds is missing', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: {},
				user: adminUser
			});
			const response = await POST(event);

			expect(response.status).toBe(400);
			const data = await response.json();
			expect(data.error).toContain('testCaseIds must be a non-empty array');
		});

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

		it('should return 400 when testCaseIds is too large', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { testCaseIds: Array.from({ length: 501 }, (_, i) => i + 1) },
				user: adminUser
			});
			const response = await POST(event);

			expect(response.status).toBe(400);
			const data = await response.json();
			expect(data.error).toContain('500 items or less');
		});

		it('should return 403 for VIEWER role', async () => {
			vi.mocked(authUtils.requireProjectRole).mockRejectedValue(
				Object.assign(new Error(), { status: 403, body: { message: 'Forbidden' } })
			);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { testCaseIds: [10] },
				user: testUser
			});
			await expect(POST(event)).rejects.toThrow();
		});
	});

	describe('DELETE', () => {
		it('should remove test cases from plan', async () => {
			mockSelectResult(mockDb, [{ id: 10 }, { id: 11 }]);
			const deleteChain = mockDeleteReturning(mockDb, [{ id: 1 }]);

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
			expect(data.removed).toBe(1);
			expect(deleteChain.returning).toHaveBeenCalledWith({ id: 'id' });
		});

		it('should report zero removed when plan items are already gone', async () => {
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

		it('should return 404 when plan not found', async () => {
			vi.mocked(
				(mockDb.query as Record<string, { findFirst: ReturnType<typeof vi.fn> }>).testPlan.findFirst
			).mockResolvedValue(null);

			const event = createMockEvent({
				method: 'DELETE',
				params: PARAMS,
				body: { testCaseIds: [10] },
				user: adminUser
			});
			await expect(DELETE(event)).rejects.toThrow();
		});

		it('should return 400 when testCaseIds is empty', async () => {
			const event = createMockEvent({
				method: 'DELETE',
				params: PARAMS,
				body: { testCaseIds: [] },
				user: adminUser
			});
			const response = await DELETE(event);

			expect(response.status).toBe(400);
			const data = await response.json();
			expect(data.error).toContain('testCaseIds must be a non-empty array');
		});

		it('should return 400 when delete testCaseIds contains duplicates', async () => {
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

		it('should return 403 for VIEWER role', async () => {
			vi.mocked(authUtils.requireProjectRole).mockRejectedValue(
				Object.assign(new Error(), { status: 403, body: { message: 'Forbidden' } })
			);

			const event = createMockEvent({
				method: 'DELETE',
				params: PARAMS,
				body: { testCaseIds: [10] },
				user: testUser
			});
			await expect(DELETE(event)).rejects.toThrow();
		});
	});
});
