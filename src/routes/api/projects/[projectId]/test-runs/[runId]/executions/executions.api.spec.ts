import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockInsertReturning } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser, adminUser, sampleTestCase, sampleTestRun } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	testCase: { id: 'id', projectId: 'project_id', latestVersionId: 'latest_version_id' },
	testCaseVersion: { id: 'id', testCaseId: 'test_case_id' },
	testExecution: { id: 'id', testRunId: 'test_run_id', testCaseVersionId: 'test_case_version_id' },
	testRun: { id: 'id', projectId: 'project_id' }
}));
vi.mock('drizzle-orm', () => ({
	and: vi.fn((...args: unknown[]) => args),
	eq: vi.fn((a: unknown, b: unknown) => [a, b])
}));
vi.mock('$lib/server/auth-utils', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/auth-utils')>('$lib/server/auth-utils');
	return {
		...actual,
		requireProjectRole: vi.fn().mockResolvedValue({ role: 'PROJECT_ADMIN' })
	};
});

const { POST } = await import('./+server');
const authUtils = await import('$lib/server/auth-utils');

const PARAMS = { projectId: '1', runId: '50' };

const sampleExecution = {
	id: 200,
	testRunId: 50,
	testCaseVersionId: 100,
	status: 'PENDING'
};

describe('/api/projects/[projectId]/test-runs/[runId]/executions', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(authUtils.requireProjectRole).mockResolvedValue({ role: 'PROJECT_ADMIN' });
		mockDb.query.testRun.findFirst = vi.fn().mockResolvedValue(sampleTestRun);
		mockDb.query.testCase.findFirst = vi.fn().mockResolvedValue(sampleTestCase);
	});

	describe('POST', () => {
		it('should create execution for non-VIEWER', async () => {
			// select returns no existing execution
			const noExistingChain = {
				from: vi.fn().mockReturnThis(),
				innerJoin: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				then: (resolve: (v: unknown) => void) => Promise.resolve([]).then(resolve)
			};
			mockDb.select.mockReturnValue(noExistingChain as never);
			mockInsertReturning(mockDb, [sampleExecution]);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { testCaseId: 10 },
				user: adminUser
			});
			const response = await POST(event);
			const body = await response.json();

			expect(response.status).toBe(200);
			expect(body.executionId).toBe(sampleExecution.id);
			expect(body.status).toBe('PENDING');
		});

		it('should return 403 for VIEWER', async () => {
			vi.mocked(authUtils.requireProjectRole).mockRejectedValue(
				Object.assign(new Error(), { status: 403, body: { message: 'Forbidden' } })
			);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { testCaseId: 10 },
				user: testUser
			});
			const response = await POST(event);

			expect(response.status).toBe(403);
		});

		it('should return 401 when unauthenticated', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { testCaseId: 10 },
				user: null
			});
			const response = await POST(event);

			expect(response.status).toBe(401);
		});
	});
});
