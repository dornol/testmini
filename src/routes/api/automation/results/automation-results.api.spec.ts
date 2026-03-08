import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockSelectResult } from '$lib/server/test-helpers/mock-db';
import { sampleProject } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();
const mockAuthenticateApiKey = vi.fn();
const mockCreateNotification = vi.fn();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	project: { id: 'id', createdBy: 'created_by' },
	projectMember: { projectId: 'project_id', userId: 'user_id' },
	testCase: {
		id: 'id',
		projectId: 'project_id',
		automationKey: 'automation_key',
		latestVersionId: 'latest_version_id'
	},
	testRun: { id: 'id', projectId: 'project_id', name: 'name', status: 'status' },
	testExecution: {
		id: 'id',
		testRunId: 'test_run_id',
		testCaseVersionId: 'test_case_version_id',
		status: 'status'
	},
	testFailureDetail: {
		id: 'id',
		testExecutionId: 'test_execution_id',
		errorMessage: 'error_message'
	}
}));
vi.mock('drizzle-orm', () => ({
	and: vi.fn((...args: unknown[]) => args),
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	inArray: vi.fn((a: unknown, b: unknown) => ['inArray', a, b])
}));
vi.mock('$lib/server/api-key-auth', () => ({
	authenticateApiKey: mockAuthenticateApiKey
}));
vi.mock('$lib/server/notifications', () => ({
	createNotification: mockCreateNotification
}));

const { POST } = await import('./+server');

function makeRequest(body: unknown): Request {
	return new Request('http://localhost:5173/api/automation/results', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});
}

function makeInvalidJsonRequest(): Request {
	return new Request('http://localhost:5173/api/automation/results', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: 'not json'
	});
}

/** Helper to set up db mocks for a full successful flow */
function setupSuccessfulFlow(opts?: {
	matchedCases?: { id: number; automationKey: string; latestVersionId: number | null }[];
	members?: { userId: string }[];
}) {
	const matchedCases = opts?.matchedCases ?? [
		{ id: 10, automationKey: 'login-test', latestVersionId: 100 }
	];
	const members = opts?.members ?? [{ userId: 'user-1' }];

	mockAuthenticateApiKey.mockResolvedValue({ projectId: 1, keyId: 1 });

	// db.query.project.findFirst
	if (!mockDb.query.project) {
		mockDb.query.project = { findFirst: vi.fn() };
	}
	mockDb.query.project.findFirst.mockResolvedValue(sampleProject);

	// Helper to create a chainable select result without side-effects on mockDb.select
	const makeChainable = (result: unknown[]) => {
		const chain: Record<string, unknown> = {};
		const methods = ['from', 'where', 'orderBy', 'limit', 'offset', 'innerJoin', 'leftJoin', 'groupBy', 'as', 'set', 'values', 'returning', 'onConflictDoNothing'];
		for (const m of methods) {
			chain[m] = vi.fn().mockImplementation(() => chain);
		}
		chain.then = (resolve: (v: unknown) => void) => Promise.resolve(result).then(resolve);
		return chain;
	};

	// db.select() is called twice: first for matchedCases, then for project members
	let selectCallCount = 0;
	mockDb.select.mockImplementation(() => {
		selectCallCount++;
		if (selectCallCount === 1) {
			return makeChainable(matchedCases) as never;
		}
		return makeChainable(members) as never;
	});

	// Transaction mock
	mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
		const tx = {
			insert: vi.fn().mockImplementation(() => makeChainable([{ id: 50 }])),
			update: vi.fn().mockImplementation(() => makeChainable([]))
		};
		return fn(tx);
	});
}

describe('/api/automation/results POST', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Ensure project query exists
		if (!mockDb.query.project) {
			mockDb.query.project = { findFirst: vi.fn() };
		}
	});

	// ─── Auth ────────────────────────────────────────────────────────────

	describe('authentication', () => {
		it('should return 401 when authenticateApiKey returns null', async () => {
			mockAuthenticateApiKey.mockResolvedValue(null);

			const request = makeRequest({
				results: [{ automationKey: 'test-1', status: 'PASS' }]
			});
			const response = await POST({ request } as never);
			const data = await response.json();

			expect(response.status).toBe(401);
			expect(data.error).toBe('Unauthorized');
		});
	});

	// ─── Validation ──────────────────────────────────────────────────────

	describe('validation', () => {
		beforeEach(() => {
			mockAuthenticateApiKey.mockResolvedValue({ projectId: 1, keyId: 1 });
		});

		it('should return 400 for invalid JSON body', async () => {
			const request = makeInvalidJsonRequest();
			const response = await POST({ request } as never);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toBe('Invalid request body');
		});

		it('should return 400 when results is missing', async () => {
			const request = makeRequest({});
			const response = await POST({ request } as never);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toContain('results array is required');
		});

		it('should return 400 when results is empty array', async () => {
			const request = makeRequest({ results: [] });
			const response = await POST({ request } as never);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toContain('results array is required');
		});

		it('should return 400 when results exceeds 10,000 entries', async () => {
			const results = Array.from({ length: 10_001 }, (_, i) => ({
				automationKey: `key-${i}`,
				status: 'PASS'
			}));
			const request = makeRequest({ results });
			const response = await POST({ request } as never);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toContain('must not exceed 10,000');
		});

		it('should return 400 when a result has no automationKey', async () => {
			const request = makeRequest({
				results: [{ status: 'PASS' }]
			});
			const response = await POST({ request } as never);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toContain('automationKey');
		});

		it('should return 400 when a result has invalid status', async () => {
			const request = makeRequest({
				results: [{ automationKey: 'test-1', status: 'INVALID' }]
			});
			const response = await POST({ request } as never);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toContain('Invalid status');
			expect(data.error).toContain('INVALID');
		});

		it('should accept valid statuses: PASS, FAIL, SKIP', async () => {
			// This should not fail validation for status (may fail later at DB level, but not at validation)
			setupSuccessfulFlow({
				matchedCases: [
					{ id: 10, automationKey: 'test-pass', latestVersionId: 100 },
					{ id: 11, automationKey: 'test-fail', latestVersionId: 101 },
					{ id: 12, automationKey: 'test-skip', latestVersionId: 102 }
				]
			});

			const request = makeRequest({
				results: [
					{ automationKey: 'test-pass', status: 'PASS' },
					{ automationKey: 'test-fail', status: 'FAIL', errorMessage: 'broken' },
					{ automationKey: 'test-skip', status: 'SKIP' }
				]
			});
			const response = await POST({ request } as never);

			// Should not be a 400 validation error
			expect(response.status).not.toBe(400);
		});
	});

	// ─── Project not found ───────────────────────────────────────────────

	describe('project lookup', () => {
		it('should return 404 when project does not exist', async () => {
			mockAuthenticateApiKey.mockResolvedValue({ projectId: 999, keyId: 1 });
			mockDb.query.project.findFirst.mockResolvedValue(null);
			// select for matchedCases
			mockDb.select.mockImplementation(
				() => mockSelectResult(mockDb, []) as never
			);

			const request = makeRequest({
				results: [{ automationKey: 'test-1', status: 'PASS' }]
			});
			const response = await POST({ request } as never);
			const data = await response.json();

			expect(response.status).toBe(404);
			expect(data.error).toBe('Project not found');
		});
	});

	// ─── Success paths ──────────────────────────────────────────────────

	describe('success paths', () => {
		it('should create a test run and return results with matched test cases', async () => {
			setupSuccessfulFlow();

			const request = makeRequest({
				results: [{ automationKey: 'login-test', status: 'PASS' }]
			});
			const response = await POST({ request } as never);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.runId).toBe(50);
			expect(data.matched).toBe(1);
			expect(data.unmatched).toEqual([]);
			expect(data.results).toHaveLength(1);
			expect(data.results[0]).toEqual({
				automationKey: 'login-test',
				status: 'PASS',
				testCaseId: 10
			});
		});

		it('should report unmatched automationKeys', async () => {
			setupSuccessfulFlow({ matchedCases: [] });

			const request = makeRequest({
				results: [{ automationKey: 'nonexistent-key', status: 'PASS' }]
			});
			const response = await POST({ request } as never);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.matched).toBe(0);
			expect(data.unmatched).toEqual(['nonexistent-key']);
			expect(data.results[0].testCaseId).toBeNull();
		});

		it('should use default run name (CI Run + timestamp) when runName not provided', async () => {
			setupSuccessfulFlow();

			const request = makeRequest({
				results: [{ automationKey: 'login-test', status: 'PASS' }]
			});
			await POST({ request } as never);

			// Verify the transaction was called and the run name starts with "CI Run"
			expect(mockDb.transaction).toHaveBeenCalled();
			const txFn = mockDb.transaction.mock.calls[0][0] as (tx: unknown) => Promise<unknown>;
			// The run name is passed inside the transaction; we verify tx.insert was called
			// with values containing "CI Run" in the name
			const txInsert = vi.fn();
			const chain: Record<string, unknown> = {};
			const chainMethods = ['from', 'where', 'set', 'values', 'returning', 'onConflictDoNothing'];
			for (const m of chainMethods) {
				chain[m] = vi.fn().mockImplementation(() => chain);
			}
			chain.then = (resolve: (v: unknown) => void) =>
				Promise.resolve([{ id: 99 }]).then(resolve);
			txInsert.mockReturnValue(chain);

			const txUpdate = vi.fn().mockReturnValue(chain);

			await txFn({ insert: txInsert, update: txUpdate });

			// First insert call is the test run
			const firstInsertValues = (txInsert.mock.results[0]?.value as Record<string, ReturnType<typeof vi.fn>>)
				.values.mock.calls[0][0];
			expect(firstInsertValues.name).toMatch(/^CI Run \d{4}-\d{2}-\d{2}/);
		});

		it('should use custom runName when provided', async () => {
			setupSuccessfulFlow();

			const request = makeRequest({
				runName: 'My Custom Run',
				results: [{ automationKey: 'login-test', status: 'PASS' }]
			});
			await POST({ request } as never);

			// Re-run the transaction function to inspect values
			const txFn = mockDb.transaction.mock.calls[0][0] as (tx: unknown) => Promise<unknown>;
			const chain: Record<string, unknown> = {};
			const chainMethods = ['from', 'where', 'set', 'values', 'returning', 'onConflictDoNothing'];
			for (const m of chainMethods) {
				chain[m] = vi.fn().mockImplementation(() => chain);
			}
			chain.then = (resolve: (v: unknown) => void) =>
				Promise.resolve([{ id: 99 }]).then(resolve);
			const txInsert = vi.fn().mockReturnValue(chain);
			const txUpdate = vi.fn().mockReturnValue(chain);

			await txFn({ insert: txInsert, update: txUpdate });

			const firstInsertValues = (txInsert.mock.results[0]?.value as Record<string, ReturnType<typeof vi.fn>>)
				.values.mock.calls[0][0];
			expect(firstInsertValues.name).toBe('My Custom Run');
		});

		it('should default environment to QA when not provided', async () => {
			setupSuccessfulFlow();

			const request = makeRequest({
				results: [{ automationKey: 'login-test', status: 'PASS' }]
			});
			await POST({ request } as never);

			const txFn = mockDb.transaction.mock.calls[0][0] as (tx: unknown) => Promise<unknown>;
			const chain: Record<string, unknown> = {};
			const chainMethods = ['from', 'where', 'set', 'values', 'returning', 'onConflictDoNothing'];
			for (const m of chainMethods) {
				chain[m] = vi.fn().mockImplementation(() => chain);
			}
			chain.then = (resolve: (v: unknown) => void) =>
				Promise.resolve([{ id: 99 }]).then(resolve);
			const txInsert = vi.fn().mockReturnValue(chain);
			const txUpdate = vi.fn().mockReturnValue(chain);

			await txFn({ insert: txInsert, update: txUpdate });

			const firstInsertValues = (txInsert.mock.results[0]?.value as Record<string, ReturnType<typeof vi.fn>>)
				.values.mock.calls[0][0];
			expect(firstInsertValues.environment).toBe('QA');
		});

		it('should uppercase the provided environment', async () => {
			setupSuccessfulFlow();

			const request = makeRequest({
				environment: 'staging',
				results: [{ automationKey: 'login-test', status: 'PASS' }]
			});
			await POST({ request } as never);

			const txFn = mockDb.transaction.mock.calls[0][0] as (tx: unknown) => Promise<unknown>;
			const chain: Record<string, unknown> = {};
			const chainMethods = ['from', 'where', 'set', 'values', 'returning', 'onConflictDoNothing'];
			for (const m of chainMethods) {
				chain[m] = vi.fn().mockImplementation(() => chain);
			}
			chain.then = (resolve: (v: unknown) => void) =>
				Promise.resolve([{ id: 99 }]).then(resolve);
			const txInsert = vi.fn().mockReturnValue(chain);
			const txUpdate = vi.fn().mockReturnValue(chain);

			await txFn({ insert: txInsert, update: txUpdate });

			const firstInsertValues = (txInsert.mock.results[0]?.value as Record<string, ReturnType<typeof vi.fn>>)
				.values.mock.calls[0][0];
			expect(firstInsertValues.environment).toBe('STAGING');
		});

		it('should create failure details for FAIL results with errorMessage', async () => {
			setupSuccessfulFlow();

			const request = makeRequest({
				results: [
					{
						automationKey: 'login-test',
						status: 'FAIL',
						errorMessage: 'Element not found',
						duration: 1500
					}
				]
			});
			await POST({ request } as never);

			// Re-run transaction to inspect insert calls
			const txFn = mockDb.transaction.mock.calls[0][0] as (tx: unknown) => Promise<unknown>;
			const insertCalls: unknown[] = [];
			const chain: Record<string, unknown> = {};
			const chainMethods = ['from', 'where', 'set', 'values', 'returning', 'onConflictDoNothing'];
			for (const m of chainMethods) {
				chain[m] = vi.fn().mockImplementation(() => chain);
			}
			chain.then = (resolve: (v: unknown) => void) =>
				Promise.resolve([{ id: 99 }]).then(resolve);
			const txInsert = vi.fn().mockImplementation((table: unknown) => {
				insertCalls.push(table);
				return chain;
			});
			const txUpdate = vi.fn().mockReturnValue(chain);

			await txFn({ insert: txInsert, update: txUpdate });

			// Should have 3 inserts: testRun, testExecution, testFailureDetail
			expect(txInsert).toHaveBeenCalledTimes(3);

			// Third insert is the failure detail
			const failureDetailValues = (chain.values as ReturnType<typeof vi.fn>).mock.calls[2][0];
			expect(failureDetailValues.errorMessage).toBe('Element not found');
			expect(failureDetailValues.comment).toBe('Duration: 1500ms');
		});

		it('should mark run as COMPLETED after processing', async () => {
			setupSuccessfulFlow();

			const request = makeRequest({
				results: [{ automationKey: 'login-test', status: 'PASS' }]
			});
			await POST({ request } as never);

			// Re-run transaction to inspect update call
			const txFn = mockDb.transaction.mock.calls[0][0] as (tx: unknown) => Promise<unknown>;
			const chain: Record<string, unknown> = {};
			const chainMethods = ['from', 'where', 'set', 'values', 'returning', 'onConflictDoNothing'];
			for (const m of chainMethods) {
				chain[m] = vi.fn().mockImplementation(() => chain);
			}
			chain.then = (resolve: (v: unknown) => void) =>
				Promise.resolve([{ id: 99 }]).then(resolve);
			const txInsert = vi.fn().mockReturnValue(chain);
			const txUpdate = vi.fn().mockReturnValue(chain);

			await txFn({ insert: txInsert, update: txUpdate });

			expect(txUpdate).toHaveBeenCalled();
			const setCall = (chain.set as ReturnType<typeof vi.fn>).mock.calls[0][0];
			expect(setCall.status).toBe('COMPLETED');
			expect(setCall.finishedAt).toBeInstanceOf(Date);
		});
	});

	// ─── Response shape ─────────────────────────────────────────────────

	describe('response shape', () => {
		it('should return runId, matched, unmatched, and results', async () => {
			setupSuccessfulFlow({
				matchedCases: [{ id: 10, automationKey: 'key-a', latestVersionId: 100 }]
			});

			const request = makeRequest({
				results: [
					{ automationKey: 'key-a', status: 'PASS' },
					{ automationKey: 'key-b', status: 'FAIL', errorMessage: 'oops' }
				]
			});
			const response = await POST({ request } as never);
			const data = await response.json();

			expect(data).toHaveProperty('runId');
			expect(data).toHaveProperty('matched');
			expect(data).toHaveProperty('unmatched');
			expect(data).toHaveProperty('results');
			expect(Array.isArray(data.unmatched)).toBe(true);
			expect(Array.isArray(data.results)).toBe(true);
			expect(data.unmatched).toContain('key-b');
		});
	});

	// ─── Notifications ──────────────────────────────────────────────────

	describe('notifications', () => {
		it('should send notification to each project member after run completes', async () => {
			setupSuccessfulFlow({
				members: [{ userId: 'user-1' }, { userId: 'user-2' }]
			});

			const request = makeRequest({
				runName: 'Nightly Build',
				results: [{ automationKey: 'login-test', status: 'PASS' }]
			});
			await POST({ request } as never);

			expect(mockCreateNotification).toHaveBeenCalledTimes(2);

			const call1 = mockCreateNotification.mock.calls[0][0];
			expect(call1.userId).toBe('user-1');
			expect(call1.type).toBe('TEST_RUN_COMPLETED');
			expect(call1.title).toBe('CI run completed');
			expect(call1.message).toContain('Nightly Build');
			expect(call1.projectId).toBe(1);

			const call2 = mockCreateNotification.mock.calls[1][0];
			expect(call2.userId).toBe('user-2');
		});

		it('should not send notifications when there are no project members', async () => {
			setupSuccessfulFlow({ members: [] });

			const request = makeRequest({
				results: [{ automationKey: 'login-test', status: 'PASS' }]
			});
			await POST({ request } as never);

			expect(mockCreateNotification).not.toHaveBeenCalled();
		});
	});
});
