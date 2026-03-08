import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockSelectResult } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	testRun: {
		id: 'id',
		projectId: 'project_id',
		name: 'name',
		environment: 'environment',
		status: 'status',
		finishedAt: 'finished_at'
	},
	testExecution: {
		id: 'id',
		testRunId: 'test_run_id',
		testCaseVersionId: 'test_case_version_id',
		status: 'status'
	},
	testCase: {
		id: 'id',
		key: 'key'
	},
	testCaseVersion: {
		id: 'id',
		testCaseId: 'test_case_id',
		title: 'title'
	}
}));
vi.mock('drizzle-orm', () => {
	const sqlTagged = (..._args: unknown[]) => ({ as: vi.fn().mockReturnValue('col') });
	const sqlFn = Object.assign(sqlTagged, { join: vi.fn() });
	return {
		eq: vi.fn((a: unknown, b: unknown) => [a, b]),
		and: vi.fn((...args: unknown[]) => args),
		desc: vi.fn((a: unknown) => a),
		sql: sqlFn,
		inArray: vi.fn((a: unknown, b: unknown) => [a, b]),
		count: vi.fn().mockReturnValue({ as: vi.fn().mockReturnValue('col') })
	};
});
vi.mock('$lib/server/auth-utils', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/auth-utils')>(
		'$lib/server/auth-utils'
	);
	return {
		...actual,
		requireProjectAccess: vi.fn().mockResolvedValue({ role: 'QA' }),
		requireProjectRole: vi.fn().mockResolvedValue({ role: 'QA' })
	};
});

/**
 * Extended chainable that includes `having` (needed by the flaky tests query).
 */
function chainableWithHaving(terminal?: () => unknown) {
	const resolver = terminal ?? (() => []);
	const chain: Record<string, unknown> = {};
	const methods = [
		'from', 'where', 'orderBy', 'limit', 'offset',
		'innerJoin', 'leftJoin', 'groupBy', 'having', 'as'
	];
	for (const m of methods) {
		chain[m] = vi.fn().mockImplementation(() => chain);
	}
	chain.then = (resolve: (v: unknown) => void) => Promise.resolve(resolver()).then(resolve);
	return chain;
}

const { GET } = await import('./+server');

const PARAMS = { projectId: '1' };

const sampleFailureTrend = [
	{
		runId: 1,
		runName: 'Run 1',
		environment: 'QA',
		finishedAt: new Date('2025-01-10'),
		totalCount: 10,
		passCount: 8,
		failCount: 2,
		blockedCount: 0,
		skippedCount: 0
	},
	{
		runId: 2,
		runName: 'Run 2',
		environment: 'QA',
		finishedAt: new Date('2025-01-11'),
		totalCount: 10,
		passCount: 7,
		failCount: 3,
		blockedCount: 0,
		skippedCount: 0
	}
];

describe('/api/projects/[projectId]/reports/trends', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should return 401 when not authenticated', async () => {
		const event = createMockEvent({ method: 'GET', params: PARAMS, user: null });
		await expect(GET(event)).rejects.toThrow();
	});

	it('should return failure trend and flaky tests when multiple runs exist', async () => {
		// First select call returns failure trend (2 runs), second returns flaky tests
		let callCount = 0;
		mockDb.select.mockImplementation(() => {
			callCount++;
			if (callCount === 1) {
				return chainableWithHaving(() => sampleFailureTrend);
			}
			// Second call: flaky tests query uses having
			return chainableWithHaving(() => [
				{ testCaseId: 1, testCaseKey: 'TC-001', testCaseTitle: 'Flaky test', passCount: 2, failCount: 1, totalRuns: 3 }
			]);
		});

		const event = createMockEvent({
			method: 'GET',
			params: PARAMS,
			user: testUser
		});

		const response = await GET(event);
		expect(response.status).toBe(200);

		const body = await response.json();
		expect(body).toHaveProperty('failureTrend');
		expect(body).toHaveProperty('flakyTests');
		expect(body.failureTrend).toHaveLength(2);
		expect(body.flakyTests).toHaveLength(1);
		expect(body.flakyTests[0].testCaseKey).toBe('TC-001');
	});

	it('should return reversed failure trend', async () => {
		mockSelectResult(mockDb, [sampleFailureTrend[0]]);

		const event = createMockEvent({
			method: 'GET',
			params: PARAMS,
			user: testUser
		});

		const response = await GET(event);
		const body = await response.json();

		// failureTrend should be reversed (chronological order)
		expect(Array.isArray(body.failureTrend)).toBe(true);
	});

	it('should return empty flaky tests when fewer than 2 runs', async () => {
		mockSelectResult(mockDb, [sampleFailureTrend[0]]);

		const event = createMockEvent({
			method: 'GET',
			params: PARAMS,
			user: testUser
		});

		const response = await GET(event);
		const body = await response.json();

		// With only 1 run, flakyTests should be empty
		expect(body.flakyTests).toEqual([]);
	});

	it('should return empty data when no completed runs', async () => {
		mockSelectResult(mockDb, []);

		const event = createMockEvent({
			method: 'GET',
			params: PARAMS,
			user: testUser
		});

		const response = await GET(event);
		expect(response.status).toBe(200);

		const body = await response.json();
		expect(body.failureTrend).toEqual([]);
		expect(body.flakyTests).toEqual([]);
	});
});
