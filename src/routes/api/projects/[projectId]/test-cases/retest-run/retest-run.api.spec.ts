import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockSelectResult } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	testCase: {
		id: 'id',
		projectId: 'project_id',
		latestVersionId: 'latest_version_id',
		retestNeeded: 'retest_needed'
	},
	testRun: {
		id: 'id',
		projectId: 'project_id',
		name: 'name',
		environment: 'environment',
		createdBy: 'created_by'
	},
	testExecution: {
		id: 'id',
		testRunId: 'test_run_id',
		testCaseVersionId: 'test_case_version_id'
	}
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

const { POST } = await import('./+server');
const authUtils = await import('$lib/server/auth-utils');

const PARAMS = { projectId: '1' };

const retestCases = [
	{ id: 10, latestVersionId: 100 },
	{ id: 11, latestVersionId: 101 }
];

describe('/api/projects/[projectId]/test-cases/retest-run', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(authUtils.requireProjectRole).mockResolvedValue({ role: 'QA' });
	});

	it('should create a retest run from cases needing retest', async () => {
		// Select returns retest cases
		mockSelectResult(mockDb, retestCases);

		// Transaction mock
		const createdRun = { id: 99, projectId: 1, name: 'Retest Run', environment: 'QA', createdBy: 'user-1' };
		mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
			const txInsertChain = {
				values: vi.fn().mockReturnThis(),
				returning: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) => Promise.resolve([createdRun]).then(r)
			};
			const txInsertExecChain = {
				values: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) => Promise.resolve(undefined).then(r)
			};
			const txUpdateChain = {
				set: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) => Promise.resolve(undefined).then(r)
			};
			let insertCall = 0;
			const tx = {
				insert: vi.fn().mockImplementation(() => {
					insertCall++;
					return insertCall === 1 ? txInsertChain : txInsertExecChain;
				}),
				update: vi.fn().mockReturnValue(txUpdateChain)
			};
			return fn(tx);
		});

		const event = createMockEvent({
			method: 'POST',
			params: PARAMS,
			body: {},
			user: testUser
		});
		const response = await POST(event);
		const data = await response.json();

		expect(response.status).toBe(201);
		expect(data.runId).toBe(99);
		expect(data.executionCount).toBe(2);
	});

	it('should use custom name and environment', async () => {
		mockSelectResult(mockDb, retestCases);

		const createdRun = { id: 100, projectId: 1, name: 'Custom Retest', environment: 'STAGING', createdBy: 'user-1' };
		mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
			const txInsertChain = {
				values: vi.fn().mockReturnThis(),
				returning: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) => Promise.resolve([createdRun]).then(r)
			};
			const txInsertExecChain = {
				values: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) => Promise.resolve(undefined).then(r)
			};
			const txUpdateChain = {
				set: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) => Promise.resolve(undefined).then(r)
			};
			let insertCall = 0;
			const tx = {
				insert: vi.fn().mockImplementation(() => {
					insertCall++;
					return insertCall === 1 ? txInsertChain : txInsertExecChain;
				}),
				update: vi.fn().mockReturnValue(txUpdateChain)
			};
			return fn(tx);
		});

		const event = createMockEvent({
			method: 'POST',
			params: PARAMS,
			body: { name: 'Custom Retest', environment: 'STAGING' },
			user: testUser
		});
		const response = await POST(event);
		const data = await response.json();

		expect(response.status).toBe(201);
		expect(data.runId).toBe(100);
	});

	it('should accept specific testCaseIds', async () => {
		mockSelectResult(mockDb, [retestCases[0]]);

		const createdRun = { id: 101, projectId: 1, name: 'Retest Run', environment: 'QA', createdBy: 'user-1' };
		mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
			const txInsertChain = {
				values: vi.fn().mockReturnThis(),
				returning: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) => Promise.resolve([createdRun]).then(r)
			};
			const txInsertExecChain = {
				values: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) => Promise.resolve(undefined).then(r)
			};
			const txUpdateChain = {
				set: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) => Promise.resolve(undefined).then(r)
			};
			let insertCall = 0;
			const tx = {
				insert: vi.fn().mockImplementation(() => {
					insertCall++;
					return insertCall === 1 ? txInsertChain : txInsertExecChain;
				}),
				update: vi.fn().mockReturnValue(txUpdateChain)
			};
			return fn(tx);
		});

		const event = createMockEvent({
			method: 'POST',
			params: PARAMS,
			body: { testCaseIds: [10] },
			user: testUser
		});
		const response = await POST(event);
		const data = await response.json();

		expect(response.status).toBe(201);
		expect(data.executionCount).toBe(1);
	});

	it('should return 400 when no cases need retesting', async () => {
		mockSelectResult(mockDb, []);

		const event = createMockEvent({
			method: 'POST',
			params: PARAMS,
			body: {},
			user: testUser
		});
		const response = await POST(event);

		expect(response.status).toBe(400);
		const data = await response.json();
		expect(data.error).toContain('No test cases need retesting');
	});

	it('should filter out cases with null latestVersionId', async () => {
		mockSelectResult(mockDb, [
			{ id: 10, latestVersionId: 100 },
			{ id: 11, latestVersionId: null }
		]);

		const createdRun = { id: 102, projectId: 1, name: 'Retest Run', environment: 'QA', createdBy: 'user-1' };
		mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
			const txInsertChain = {
				values: vi.fn().mockReturnThis(),
				returning: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) => Promise.resolve([createdRun]).then(r)
			};
			const txInsertExecChain = {
				values: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) => Promise.resolve(undefined).then(r)
			};
			const txUpdateChain = {
				set: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) => Promise.resolve(undefined).then(r)
			};
			let insertCall = 0;
			const tx = {
				insert: vi.fn().mockImplementation(() => {
					insertCall++;
					return insertCall === 1 ? txInsertChain : txInsertExecChain;
				}),
				update: vi.fn().mockReturnValue(txUpdateChain)
			};
			return fn(tx);
		});

		const event = createMockEvent({
			method: 'POST',
			params: PARAMS,
			body: {},
			user: testUser
		});
		const response = await POST(event);
		const data = await response.json();

		expect(response.status).toBe(201);
		expect(data.executionCount).toBe(1);
	});

	it('should return 400 when all cases have null latestVersionId', async () => {
		mockSelectResult(mockDb, [
			{ id: 10, latestVersionId: null },
			{ id: 11, latestVersionId: null }
		]);

		const event = createMockEvent({
			method: 'POST',
			params: PARAMS,
			body: {},
			user: testUser
		});
		const response = await POST(event);

		expect(response.status).toBe(400);
	});

	it('should return 401 when unauthenticated', async () => {
		const event = createMockEvent({
			method: 'POST',
			params: PARAMS,
			body: {},
			user: null
		});
		await expect(POST(event)).rejects.toThrow();
	});

	it('should return 403 for insufficient role', async () => {
		vi.mocked(authUtils.requireProjectRole).mockRejectedValue(
			Object.assign(new Error(), { status: 403, body: { message: 'Forbidden' } })
		);

		const event = createMockEvent({
			method: 'POST',
			params: PARAMS,
			body: {},
			user: testUser
		});
		await expect(POST(event)).rejects.toThrow();
	});
});
