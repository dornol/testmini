import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockSelectResult } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { adminUser, testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();
// The items endpoint uses db.query.testPlan.findFirst
(mockDb.query as Record<string, unknown>).testPlan = { findFirst: vi.fn() };

vi.mock('$lib/server/db', () => ({ db: mockDb }));
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
	const actual = await vi.importActual<typeof import('$lib/server/auth-utils')>('$lib/server/auth-utils');
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

			// Mock insert for each test case
			const insertChain = {
				values: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) => Promise.resolve(undefined).then(r)
			};
			mockDb.insert.mockReturnValue(insertChain as never);

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
			expect(data.error).toBe('Invalid input');
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
			expect(data.error).toBe('Invalid input');
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
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.success).toBe(true);
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
			expect(data.error).toBe('Invalid input');
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
