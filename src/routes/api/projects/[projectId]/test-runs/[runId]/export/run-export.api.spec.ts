import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser, sampleTestRun } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	testRun: { id: 'id', projectId: 'project_id', name: 'name', environment: 'environment' },
	testExecution: { id: 'id', testRunId: 'test_run_id', testCaseVersionId: 'test_case_version_id', status: 'status', comment: 'comment', executedBy: 'executed_by', executedAt: 'executed_at' },
	testCaseVersion: { id: 'id', testCaseId: 'test_case_id', title: 'title', priority: 'priority', versionNo: 'version_no' },
	testCase: { id: 'id', key: 'key' },
	testFailureDetail: { testExecutionId: 'test_execution_id', errorMessage: 'error_message' },
	user: { id: 'id', name: 'name' }
}));
vi.mock('drizzle-orm', () => ({
	and: vi.fn((...args: unknown[]) => args),
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	gt: vi.fn((a: unknown, b: unknown) => ['gt', a, b]),
	inArray: vi.fn((a: unknown, b: unknown) => ['inArray', a, b])
}));
vi.mock('$lib/server/auth-utils', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/auth-utils')>('$lib/server/auth-utils');
	return {
		...actual,
		requireProjectAccess: vi.fn().mockResolvedValue({ role: 'QA' })
	};
});

const { GET } = await import('./+server');
const authUtils = await import('$lib/server/auth-utils');

const PARAMS = { projectId: '1', runId: '50' };

describe('/api/projects/[projectId]/test-runs/[runId]/export', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(authUtils.requireProjectAccess).mockResolvedValue({ role: 'QA' });
	});

	describe('GET', () => {
		it('should return 401 when unauthenticated', async () => {
			const event = createMockEvent({ method: 'GET', params: PARAMS, user: null });
			await expect(GET(event)).rejects.toThrow();
		});

		it('should return CSV with execution data', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(sampleTestRun);

			const execRow = {
				id: 200,
				testCaseKey: 'TC-0001',
				testCaseTitle: 'Login should work',
				priority: 'MEDIUM',
				versionNo: 1,
				status: 'PASSED',
				comment: null,
				executedBy: 'Test User',
				executedAt: new Date('2025-01-01').toISOString()
			};

			let selectCallCount = 0;
			const makeSelectChain = (result: unknown[]) => ({
				from: vi.fn().mockReturnThis(),
				innerJoin: vi.fn().mockReturnThis(),
				leftJoin: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				orderBy: vi.fn().mockReturnThis(),
				limit: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) => Promise.resolve(result).then(r)
			});

			mockDb.select.mockImplementation(() => {
				selectCallCount++;
				// First batch call returns one row, second (failures) returns empty, third (next batch) returns empty to stop the loop
				if (selectCallCount === 1) return makeSelectChain([execRow]) as never;
				if (selectCallCount === 2) return makeSelectChain([]) as never;
				return makeSelectChain([]) as never;
			});

			const event = createMockEvent({ method: 'GET', params: PARAMS, user: testUser });
			const response = await GET(event);

			expect(response.status).toBe(200);
			expect(response.headers.get('Content-Type')).toContain('text/csv');
			expect(response.headers.get('Content-Disposition')).toContain('.csv');

			const text = await response.text();
			expect(text).toContain('Test Case Key');
			expect(text).toContain('TC-0001');
		});

		it('should return 404 when test run not found', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(null);
			const event = createMockEvent({ method: 'GET', params: PARAMS, user: testUser });
			await expect(GET(event)).rejects.toThrow();
		});

		it('should return CSV with empty body when run has no executions', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(sampleTestRun);

			const emptySelectChain = {
				from: vi.fn().mockReturnThis(),
				innerJoin: vi.fn().mockReturnThis(),
				leftJoin: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				orderBy: vi.fn().mockReturnThis(),
				limit: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) => Promise.resolve([]).then(r)
			};
			mockDb.select.mockReturnValue(emptySelectChain as never);

			const event = createMockEvent({ method: 'GET', params: PARAMS, user: testUser });
			const response = await GET(event);

			expect(response.status).toBe(200);
			expect(response.headers.get('Content-Type')).toContain('text/csv');

			const text = await response.text();
			// Header row should still be present
			expect(text).toContain('Test Case Key');
		});
	});
});
