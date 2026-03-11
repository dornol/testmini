import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	testRun: { id: 'id', projectId: 'project_id', retestOfRunId: 'retest_of_run_id' },
	testExecution: { id: 'id', testRunId: 'test_run_id', testCaseVersionId: 'test_case_version_id', status: 'status' },
	testCaseVersion: { id: 'id', testCaseId: 'test_case_id', title: 'title', priority: 'priority' },
	testCase: { id: 'id', key: 'key' }
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
		requireProjectAccess: vi.fn().mockResolvedValue({ role: 'QA' })
	};
});

const { GET } = await import('./+server');

const PARAMS = { projectId: '1', runId: '50' };

const retestRun = {
	id: 50,
	projectId: 1,
	name: 'Retest of Sprint 1',
	retestOfRunId: 40,
	status: 'COMPLETED'
};

const nonRetestRun = {
	id: 51,
	projectId: 1,
	name: 'Sprint 2 Run',
	retestOfRunId: null,
	status: 'COMPLETED'
};

describe('/api/projects/[projectId]/test-runs/[runId]/comparison', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		(mockDb.query as Record<string, { findFirst: ReturnType<typeof vi.fn> }>).testRun = {
			findFirst: vi.fn().mockResolvedValue(retestRun)
		};
	});

	it('should return comparison data for a retest run', async () => {
		let selectCall = 0;
		mockDb.select.mockImplementation(() => {
			selectCall++;
			if (selectCall === 1) {
				// Original run executions
				return {
					from: vi.fn().mockReturnThis(),
					innerJoin: vi.fn().mockReturnThis(),
					where: vi.fn().mockReturnThis(),
					then: (r: (v: unknown) => void) =>
						Promise.resolve([
							{ testCaseVersionId: 100, status: 'FAIL', testCaseKey: 'TC-0001', title: 'Login test', priority: 'HIGH' },
							{ testCaseVersionId: 101, status: 'BLOCKED', testCaseKey: 'TC-0002', title: 'Signup test', priority: 'MEDIUM' },
							{ testCaseVersionId: 102, status: 'PASS', testCaseKey: 'TC-0003', title: 'Logout test', priority: 'LOW' }
						]).then(r)
				} as never;
			}
			// Retest run executions
			return {
				from: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) =>
					Promise.resolve([
						{ testCaseVersionId: 100, status: 'PASS' },
						{ testCaseVersionId: 101, status: 'PASS' },
						{ testCaseVersionId: 102, status: 'FAIL' }
					]).then(r)
			} as never;
		});

		const event = createMockEvent({ method: 'GET', params: PARAMS, user: testUser });
		const response = await GET(event);
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.originalRunId).toBe(40);
		expect(data.retestRunId).toBe(50);
		expect(data.summary.total).toBe(3);
		expect(data.summary.improved).toBe(2); // FAIL→PASS, BLOCKED→PASS
		expect(data.summary.regressed).toBe(1); // PASS→FAIL
		expect(data.summary.unchanged).toBe(0);
		expect(data.comparisons).toHaveLength(3);

		const loginComp = data.comparisons.find((c: { testCaseKey: string }) => c.testCaseKey === 'TC-0001');
		expect(loginComp.originalStatus).toBe('FAIL');
		expect(loginComp.retestStatus).toBe('PASS');
		expect(loginComp.improved).toBe(true);
	});

	it('should return 400 when run is not a retest run', async () => {
		(mockDb.query as Record<string, { findFirst: ReturnType<typeof vi.fn> }>).testRun.findFirst.mockResolvedValue(nonRetestRun);

		const event = createMockEvent({
			method: 'GET',
			params: { projectId: '1', runId: '51' },
			user: testUser
		});
		const response = await GET(event);

		expect(response.status).toBe(400);
		const data = await response.json();
		expect(data.error).toContain('not a retest');
	});

	it('should return 404 when run not found', async () => {
		(mockDb.query as Record<string, { findFirst: ReturnType<typeof vi.fn> }>).testRun.findFirst.mockResolvedValue(null);

		const event = createMockEvent({ method: 'GET', params: PARAMS, user: testUser });
		const response = await GET(event);

		expect(response.status).toBe(404);
	});

	it('should handle empty comparison (no matching versions)', async () => {
		let selectCall = 0;
		mockDb.select.mockImplementation(() => {
			selectCall++;
			if (selectCall === 1) {
				return {
					from: vi.fn().mockReturnThis(),
					innerJoin: vi.fn().mockReturnThis(),
					where: vi.fn().mockReturnThis(),
					then: (r: (v: unknown) => void) =>
						Promise.resolve([
							{ testCaseVersionId: 100, status: 'FAIL', testCaseKey: 'TC-0001', title: 'Test', priority: 'HIGH' }
						]).then(r)
				} as never;
			}
			return {
				from: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) =>
					Promise.resolve([
						{ testCaseVersionId: 999, status: 'PASS' } // different version
					]).then(r)
			} as never;
		});

		const event = createMockEvent({ method: 'GET', params: PARAMS, user: testUser });
		const response = await GET(event);
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.comparisons).toHaveLength(0);
		expect(data.summary.total).toBe(0);
	});

	it('should correctly identify unchanged results', async () => {
		let selectCall = 0;
		mockDb.select.mockImplementation(() => {
			selectCall++;
			if (selectCall === 1) {
				return {
					from: vi.fn().mockReturnThis(),
					innerJoin: vi.fn().mockReturnThis(),
					where: vi.fn().mockReturnThis(),
					then: (r: (v: unknown) => void) =>
						Promise.resolve([
							{ testCaseVersionId: 100, status: 'FAIL', testCaseKey: 'TC-0001', title: 'Test', priority: 'HIGH' }
						]).then(r)
				} as never;
			}
			return {
				from: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) =>
					Promise.resolve([
						{ testCaseVersionId: 100, status: 'FAIL' }
					]).then(r)
			} as never;
		});

		const event = createMockEvent({ method: 'GET', params: PARAMS, user: testUser });
		const response = await GET(event);
		const data = await response.json();

		expect(data.summary.unchanged).toBe(1);
		expect(data.summary.improved).toBe(0);
		expect(data.comparisons[0].improved).toBe(false);
	});

	it('should reject invalid run ID', async () => {
		const event = createMockEvent({
			method: 'GET',
			params: { projectId: '1', runId: 'abc' },
			user: testUser
		});
		await expect(GET(event)).rejects.toThrow();
	});

	it('should return 401 when unauthenticated', async () => {
		const event = createMockEvent({ method: 'GET', params: PARAMS, user: null });
		await expect(GET(event)).rejects.toThrow();
	});
});
