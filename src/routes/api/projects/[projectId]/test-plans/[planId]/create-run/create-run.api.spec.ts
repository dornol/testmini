import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockSelectResult } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();
// The create-run endpoint uses db.query.testPlan.findFirst
(mockDb.query as Record<string, unknown>).testPlan = { findFirst: vi.fn() };

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	testPlan: { id: 'id', projectId: 'project_id' },
	testPlanTestCase: {
		testPlanId: 'test_plan_id',
		testCaseId: 'test_case_id',
		position: 'position'
	},
	testCase: { id: 'id', projectId: 'project_id', latestVersionId: 'latest_version_id' },
	testCaseDataSet: {
		id: 'id',
		testCaseId: 'test_case_id',
		orderIndex: 'order_index',
		values: 'values'
	},
	testRun: {
		id: 'id',
		projectId: 'project_id',
		name: 'name',
		environment: 'environment',
		createdBy: 'created_by',
		testPlanId: 'test_plan_id'
	},
	testExecution: {
		id: 'id',
		testRunId: 'test_run_id',
		testCaseVersionId: 'test_case_version_id',
		dataSetId: 'data_set_id',
		parameterValues: 'parameter_values'
	}
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	and: vi.fn((...args: unknown[]) => args)
}));

vi.mock('$lib/server/auth-utils', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/auth-utils')>('$lib/server/auth-utils');
	return {
		...actual,
		requireProjectRole: vi.fn().mockResolvedValue({ role: 'QA' })
	};
});

const { POST } = await import('./+server');
const authUtils = await import('$lib/server/auth-utils');

const PARAMS = { projectId: '1', planId: '1' };

const samplePlan = { id: 1, projectId: 1, name: 'Sprint 1 Plan', status: 'DRAFT' };

describe('/api/projects/[projectId]/test-plans/[planId]/create-run', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(authUtils.requireProjectRole).mockResolvedValue({ role: 'QA' });
		vi.mocked(
			(mockDb.query as Record<string, { findFirst: ReturnType<typeof vi.fn> }>).testPlan.findFirst
		).mockResolvedValue(samplePlan);
	});

	it('should create a test run from plan', async () => {
		// Mock plan items query
		let selectCall = 0;
		mockDb.select.mockImplementation(() => {
			selectCall++;
			if (selectCall === 1) {
				// plan items
				return {
					from: vi.fn().mockReturnThis(),
					where: vi.fn().mockReturnThis(),
					orderBy: vi.fn().mockReturnThis(),
					then: (r: (v: unknown) => void) => Promise.resolve([{ testCaseId: 10 }, { testCaseId: 11 }]).then(r)
				} as never;
			} else if (selectCall === 2) {
				// selected cases with latest versions
				return {
					from: vi.fn().mockReturnThis(),
					where: vi.fn().mockReturnThis(),
					then: (r: (v: unknown) => void) => Promise.resolve([
						{ id: 10, latestVersionId: 100 },
						{ id: 11, latestVersionId: 101 }
					]).then(r)
				} as never;
			} else {
				// data sets
				return {
					from: vi.fn().mockReturnThis(),
					orderBy: vi.fn().mockReturnThis(),
					then: (r: (v: unknown) => void) => Promise.resolve([]).then(r)
				} as never;
			}
		});

		// Mock transaction
		const createdRun = { id: 99, projectId: 1, name: 'Run from Plan', environment: 'QA', testPlanId: 1, createdBy: 'user-1' };
		mockDb.transaction.mockImplementationOnce(async (fn: (tx: unknown) => Promise<unknown>) => {
			const txInsertChain = {
				values: vi.fn().mockReturnThis(),
				returning: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) => Promise.resolve([createdRun]).then(r)
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
			body: { name: 'Run from Plan', environment: 'QA' },
			user: testUser
		});
		const response = await POST(event);
		const data = await response.json();

		expect(response.status).toBe(201);
		expect(data.runId).toBe(99);
	});

	it('should return 404 when plan not found', async () => {
		vi.mocked(
			(mockDb.query as Record<string, { findFirst: ReturnType<typeof vi.fn> }>).testPlan.findFirst
		).mockResolvedValue(null);

		const event = createMockEvent({
			method: 'POST',
			params: PARAMS,
			body: { name: 'Run', environment: 'QA' },
			user: testUser
		});
		await expect(POST(event)).rejects.toThrow();
	});

	it('should return 400 when name is missing', async () => {
		const event = createMockEvent({
			method: 'POST',
			params: PARAMS,
			body: { environment: 'QA' },
			user: testUser
		});
		const response = await POST(event);

		expect(response.status).toBe(400);
		const data = await response.json();
		expect(data.error).toBe('Invalid input');
	});

	it('should return 400 when environment is missing', async () => {
		const event = createMockEvent({
			method: 'POST',
			params: PARAMS,
			body: { name: 'Run' },
			user: testUser
		});
		const response = await POST(event);

		expect(response.status).toBe(400);
		const data = await response.json();
		expect(data.error).toBe('Invalid input');
	});

	it('should return 400 when plan has no test cases', async () => {
		// Return empty plan items
		mockSelectResult(mockDb, []);

		const event = createMockEvent({
			method: 'POST',
			params: PARAMS,
			body: { name: 'Run', environment: 'QA' },
			user: testUser
		});
		await expect(POST(event)).rejects.toThrow();
	});

	it('should return 401 when unauthenticated', async () => {
		const event = createMockEvent({
			method: 'POST',
			params: PARAMS,
			body: { name: 'Run', environment: 'QA' },
			user: null
		});
		await expect(POST(event)).rejects.toThrow();
	});

	it('should return 403 for VIEWER role', async () => {
		vi.mocked(authUtils.requireProjectRole).mockRejectedValue(
			Object.assign(new Error(), { status: 403, body: { message: 'Forbidden' } })
		);

		const event = createMockEvent({
			method: 'POST',
			params: PARAMS,
			body: { name: 'Run', environment: 'QA' },
			user: testUser
		});
		await expect(POST(event)).rejects.toThrow();
	});
});
