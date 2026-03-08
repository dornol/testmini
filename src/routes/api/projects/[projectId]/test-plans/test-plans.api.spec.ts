import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockSelectResult } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser, adminUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	testPlan: {
		id: 'id',
		name: 'name',
		description: 'description',
		status: 'status',
		milestone: 'milestone',
		startDate: 'start_date',
		endDate: 'end_date',
		projectId: 'project_id',
		createdBy: 'created_by',
		createdAt: 'created_at'
	},
	testPlanTestCase: {
		id: 'id',
		testPlanId: 'test_plan_id',
		testCaseId: 'test_case_id',
		position: 'position'
	},
	testRun: {
		id: 'id',
		testPlanId: 'test_plan_id'
	},
	user: { id: 'id', name: 'name' }
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	sql: Object.assign(
		(strings: TemplateStringsArray, ...values: unknown[]) => ({
			as: () => ({ sql: strings, values })
		}),
		{ raw: (s: string) => s }
	),
	and: vi.fn((...args: unknown[]) => args)
}));

vi.mock('$lib/server/auth-utils', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/auth-utils')>('$lib/server/auth-utils');
	return {
		...actual,
		requireProjectAccess: vi.fn().mockResolvedValue({ role: 'QA' }),
		requireProjectRole: vi.fn().mockResolvedValue({ role: 'QA' })
	};
});

const { GET, POST } = await import('./+server');
const authUtils = await import('$lib/server/auth-utils');

const PARAMS = { projectId: '1' };

const samplePlan = {
	id: 1,
	name: 'Sprint 1 Plan',
	description: 'Test plan for sprint 1',
	status: 'DRAFT',
	milestone: 'v1.0',
	startDate: '2025-01-01',
	endDate: '2025-01-31',
	createdBy: 'Test User',
	createdAt: new Date('2025-01-01'),
	itemCount: 5,
	runCount: 2
};

describe('/api/projects/[projectId]/test-plans', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(authUtils.requireProjectAccess).mockResolvedValue({ role: 'QA' });
		vi.mocked(authUtils.requireProjectRole).mockResolvedValue({ role: 'QA' });
	});

	describe('GET', () => {
		it('should return test plans list', async () => {
			mockSelectResult(mockDb, [samplePlan]);

			const event = createMockEvent({
				method: 'GET',
				params: PARAMS,
				user: testUser
			});
			const response = await GET(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(Array.isArray(data)).toBe(true);
			expect(data).toHaveLength(1);
			expect(data[0].id).toBe(1);
			expect(data[0].name).toBe('Sprint 1 Plan');
		});

		it('should return empty array when no plans exist', async () => {
			mockSelectResult(mockDb, []);

			const event = createMockEvent({
				method: 'GET',
				params: PARAMS,
				user: testUser
			});
			const response = await GET(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data).toEqual([]);
		});

		it('should support status filter', async () => {
			mockSelectResult(mockDb, [samplePlan]);

			const event = createMockEvent({
				method: 'GET',
				params: PARAMS,
				user: testUser,
				searchParams: { status: 'DRAFT' }
			});
			const response = await GET(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(Array.isArray(data)).toBe(true);
		});

		it('should return 401 when unauthenticated', async () => {
			const event = createMockEvent({
				method: 'GET',
				params: PARAMS,
				user: null
			});
			await expect(GET(event)).rejects.toThrow();
		});
	});

	describe('POST', () => {
		it('should create test plan', async () => {
			const created = {
				id: 10,
				projectId: 1,
				name: 'New Plan',
				description: null,
				status: 'DRAFT',
				milestone: null,
				startDate: null,
				endDate: null,
				createdBy: 'user-1',
				createdAt: new Date()
			};
			mockDb.transaction.mockImplementationOnce(async (fn: (tx: unknown) => Promise<unknown>) => {
				const txInsertChain = {
					values: vi.fn().mockReturnThis(),
					returning: vi.fn().mockReturnThis(),
					then: (r: (v: unknown) => void) => Promise.resolve([created]).then(r)
				};
				const tx = {
					insert: vi.fn().mockReturnValue(txInsertChain),
					update: vi.fn(),
					delete: vi.fn(),
					select: vi.fn()
				};
				return fn(tx);
			});

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { name: 'New Plan' },
				user: testUser
			});
			const response = await POST(event);
			const data = await response.json();

			expect(response.status).toBe(201);
			expect(data.id).toBe(10);
		});

		it('should create plan with testCaseIds', async () => {
			const created = {
				id: 11,
				projectId: 1,
				name: 'Plan with Cases',
				description: null,
				status: 'DRAFT',
				milestone: null,
				startDate: null,
				endDate: null,
				createdBy: 'user-1',
				createdAt: new Date()
			};
			let insertedItems = false;
			mockDb.transaction.mockImplementationOnce(async (fn: (tx: unknown) => Promise<unknown>) => {
				const txInsertChain = {
					values: vi.fn().mockImplementation(function (this: unknown) {
						insertedItems = true;
						return txInsertChain;
					}),
					returning: vi.fn().mockReturnThis(),
					then: (r: (v: unknown) => void) => Promise.resolve([created]).then(r)
				};
				const tx = {
					insert: vi.fn().mockReturnValue(txInsertChain),
					update: vi.fn(),
					delete: vi.fn(),
					select: vi.fn()
				};
				return fn(tx);
			});

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { name: 'Plan with Cases', testCaseIds: [1, 2, 3] },
				user: testUser
			});
			const response = await POST(event);
			const data = await response.json();

			expect(response.status).toBe(201);
			expect(data.id).toBe(11);
		});

		it('should create test plan for PROJECT_ADMIN', async () => {
			const created = { id: 12, projectId: 1, name: 'Admin Plan', createdBy: 'admin-1', createdAt: new Date() };
			vi.mocked(authUtils.requireProjectRole).mockResolvedValue({ role: 'PROJECT_ADMIN' });
			mockDb.transaction.mockImplementationOnce(async (fn: (tx: unknown) => Promise<unknown>) => {
				const txInsertChain = {
					values: vi.fn().mockReturnThis(),
					returning: vi.fn().mockReturnThis(),
					then: (r: (v: unknown) => void) => Promise.resolve([created]).then(r)
				};
				const tx = {
					insert: vi.fn().mockReturnValue(txInsertChain),
					update: vi.fn(),
					delete: vi.fn(),
					select: vi.fn()
				};
				return fn(tx);
			});

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { name: 'Admin Plan' },
				user: adminUser
			});
			const response = await POST(event);
			const data = await response.json();

			expect(response.status).toBe(201);
			expect(data.id).toBe(12);
		});

		it('should return 400 when name is missing', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: {},
				user: testUser
			});
			const response = await POST(event);

			expect(response.status).toBe(400);
			const data = await response.json();
			expect(data.error).toBe('Invalid input');
		});

		it('should return 400 when name is empty', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { name: '' },
				user: testUser
			});
			const response = await POST(event);

			expect(response.status).toBe(400);
			const data = await response.json();
			expect(data.error).toBe('Invalid input');
		});

		it('should return 400 when name is too long', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { name: 'A'.repeat(201) },
				user: testUser
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
				body: { name: 'New Plan' },
				user: testUser
			});
			await expect(POST(event)).rejects.toThrow();
		});

		it('should return 401 when unauthenticated', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { name: 'New Plan' },
				user: null
			});
			await expect(POST(event)).rejects.toThrow();
		});
	});
});
