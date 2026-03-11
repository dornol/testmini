import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser, adminUser, sampleTestRun } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	testRun: { id: 'id', projectId: 'project_id', name: 'name', status: 'status', environment: 'environment' },
	testExecution: { testRunId: 'test_run_id', testCaseVersionId: 'test_case_version_id', status: 'status' },
	testCaseVersion: { id: 'id', testCaseId: 'test_case_id' },
	testCase: { id: 'id', latestVersionId: 'latest_version_id' }
}));
vi.mock('drizzle-orm', () => ({
	and: vi.fn((...args: unknown[]) => args),
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	inArray: vi.fn((a: unknown, b: unknown) => [a, b])
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

const PARAMS = { projectId: '1', runId: '50' };

function setupSelectChain(result: unknown[]) {
	const chain = {
		from: vi.fn().mockReturnThis(),
		innerJoin: vi.fn().mockReturnThis(),
		where: vi.fn().mockResolvedValue(result)
	};
	mockDb.select.mockReturnValue(chain as never);
	return chain;
}

function setupTransaction() {
	const insertValues = vi.fn();
	const insertReturning = vi.fn();
	const txInsert = vi.fn();

	mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
		return fn({ insert: txInsert });
	});

	return { insertValues, insertReturning, txInsert };
}

function setupTransactionSuccess(newRunId: number) {
	const insertReturning = vi.fn().mockResolvedValue([{ id: newRunId }]);
	const insertValues = vi.fn().mockReturnValue({ returning: insertReturning });
	const txInsert = vi.fn().mockReturnValue({ values: insertValues });

	mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
		return fn({ insert: txInsert });
	});

	return { insertValues, insertReturning, txInsert };
}

describe('/api/projects/[projectId]/test-runs/[runId]/retest', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(authUtils.requireProjectRole).mockResolvedValue({ role: 'QA' });
	});

	describe('POST', () => {
		it('should return 401 when unauthenticated', async () => {
			const event = createMockEvent({ method: 'POST', params: PARAMS, user: null });
			await expect(POST(event)).rejects.toThrow();
		});

		it('should return 403 for VIEWER role', async () => {
			vi.mocked(authUtils.requireProjectRole).mockRejectedValue(
				Object.assign(new Error('Forbidden'), { status: 403 })
			);
			const event = createMockEvent({ method: 'POST', params: PARAMS, user: testUser });
			await expect(POST(event)).rejects.toThrow();
		});

		it('should return 404 when original run not found', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(null);
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: {},
				user: adminUser
			});
			await expect(POST(event)).rejects.toThrow();
		});

		it('should return 400 when no FAIL/BLOCKED executions exist', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(sampleTestRun);
			setupSelectChain([]);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: {},
				user: adminUser
			});
			await expect(POST(event)).rejects.toThrow();
		});

		it('should create retest run with FAIL/BLOCKED executions', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(sampleTestRun);
			setupSelectChain([
				{ testCaseId: 1, latestVersionId: 10 },
				{ testCaseId: 2, latestVersionId: 20 }
			]);
			setupTransactionSuccess(99);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { name: 'My Retest' },
				user: adminUser
			});

			const response = await POST(event);
			const data = await response.json();
			expect(response.status).toBe(200);
			expect(data.id).toBe(99);
		});

		it('should use default name "Retest of <original>" when name not provided', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(sampleTestRun);
			setupSelectChain([{ testCaseId: 1, latestVersionId: 10 }]);
			const { insertValues } = setupTransactionSuccess(100);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: {},
				user: adminUser
			});

			const response = await POST(event);
			const data = await response.json();
			expect(data.id).toBe(100);

			const runInsert = insertValues.mock.calls[0][0];
			expect(runInsert.name).toBe(`Retest of ${sampleTestRun.name}`);
		});

		it('should set retestOfRunId on the new run', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(sampleTestRun);
			setupSelectChain([{ testCaseId: 1, latestVersionId: 10 }]);
			const { insertValues } = setupTransactionSuccess(101);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: {},
				user: adminUser
			});

			await POST(event);

			const runInsert = insertValues.mock.calls[0][0];
			expect(runInsert.retestOfRunId).toBe(50);
		});

		it('should preserve environment from original run', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(sampleTestRun);
			setupSelectChain([{ testCaseId: 1, latestVersionId: 10 }]);
			const { insertValues } = setupTransactionSuccess(102);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: {},
				user: adminUser
			});

			await POST(event);

			const runInsert = insertValues.mock.calls[0][0];
			expect(runInsert.environment).toBe(sampleTestRun.environment);
		});

		it('should set createdBy to current user', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(sampleTestRun);
			setupSelectChain([{ testCaseId: 1, latestVersionId: 10 }]);
			const { insertValues } = setupTransactionSuccess(103);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: {},
				user: testUser
			});

			await POST(event);

			const runInsert = insertValues.mock.calls[0][0];
			expect(runInsert.createdBy).toBe(testUser.id);
		});

		it('should filter out executions with null latestVersionId', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(sampleTestRun);
			setupSelectChain([
				{ testCaseId: 1, latestVersionId: 10 },
				{ testCaseId: 2, latestVersionId: null },
				{ testCaseId: 3, latestVersionId: 30 }
			]);
			const { insertValues } = setupTransactionSuccess(104);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: {},
				user: adminUser
			});

			await POST(event);

			const execInsert = insertValues.mock.calls[1][0];
			expect(execInsert).toHaveLength(2);
			expect(execInsert[0].testCaseVersionId).toBe(10);
			expect(execInsert[1].testCaseVersionId).toBe(30);
		});

		it('should create execution records with correct testRunId', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(sampleTestRun);
			setupSelectChain([
				{ testCaseId: 1, latestVersionId: 10 },
				{ testCaseId: 2, latestVersionId: 20 }
			]);

			const newRunId = 105;
			const insertReturning = vi.fn().mockResolvedValue([{ id: newRunId }]);
			const insertValues = vi.fn().mockReturnValue({ returning: insertReturning });
			const txInsert = vi.fn().mockReturnValue({ values: insertValues });
			mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
				return fn({ insert: txInsert });
			});

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: {},
				user: adminUser
			});

			await POST(event);

			// Second insert call creates executions
			const execInsert = insertValues.mock.calls[1][0];
			expect(execInsert).toHaveLength(2);
			expect(execInsert[0].testRunId).toBe(newRunId);
			expect(execInsert[1].testRunId).toBe(newRunId);
		});

		it('should handle malformed request body gracefully', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(sampleTestRun);
			setupSelectChain([{ testCaseId: 1, latestVersionId: 10 }]);
			setupTransactionSuccess(106);

			// Create event with request that fails JSON parsing
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: adminUser
			});

			const response = await POST(event);
			const data = await response.json();
			expect(data.id).toBe(106);
		});

		it('should use custom name when provided', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(sampleTestRun);
			setupSelectChain([{ testCaseId: 1, latestVersionId: 10 }]);
			const { insertValues } = setupTransactionSuccess(107);

			const customName = 'Regression Retest - Sprint 5';
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { name: customName },
				user: adminUser
			});

			await POST(event);

			const runInsert = insertValues.mock.calls[0][0];
			expect(runInsert.name).toBe(customName);
		});

		it('should work with single failed execution', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(sampleTestRun);
			setupSelectChain([{ testCaseId: 5, latestVersionId: 50 }]);
			const { insertValues } = setupTransactionSuccess(108);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: {},
				user: adminUser
			});

			const response = await POST(event);
			const data = await response.json();
			expect(data.id).toBe(108);

			const execInsert = insertValues.mock.calls[1][0];
			expect(execInsert).toHaveLength(1);
			expect(execInsert[0].testCaseVersionId).toBe(50);
		});

		it('should handle all executions having null latestVersionId', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(sampleTestRun);
			setupSelectChain([
				{ testCaseId: 1, latestVersionId: null },
				{ testCaseId: 2, latestVersionId: null }
			]);

			const insertReturning = vi.fn().mockResolvedValue([{ id: 109 }]);
			const insertValues = vi.fn().mockReturnValue({ returning: insertReturning });
			const txInsert = vi.fn().mockReturnValue({ values: insertValues });
			mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
				return fn({ insert: txInsert });
			});

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: {},
				user: adminUser
			});

			await POST(event);

			// Only run insert should happen, no execution insert (all filtered out)
			expect(txInsert).toHaveBeenCalledTimes(1);
		});
	});
});
