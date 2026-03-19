import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser, sampleExecution } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();
const mockRequireEditableRun = vi.fn().mockResolvedValue({ id: 50, projectId: 1, status: 'CREATED' });

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	testExecution: { id: 'id', testRunId: 'test_run_id' },
	testFailureDetail: { id: 'id', testExecutionId: 'test_execution_id' }
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	and: vi.fn((...args: unknown[]) => args)
}));
vi.mock('$lib/server/auth-utils', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/auth-utils')>('$lib/server/auth-utils');
	return {
		...actual,
		requireProjectRole: vi.fn().mockResolvedValue({ role: 'QA' }),
		requireProjectAccess: vi.fn().mockResolvedValue({ role: 'QA' })
	};
});
vi.mock('$lib/server/crud-helpers', () => ({
	requireEditableRun: mockRequireEditableRun
}));

const { DELETE } = await import('./+server');

const PARAMS = { projectId: '1', runId: '50', executionId: '200' };

describe('/api/projects/[projectId]/test-runs/[runId]/executions/[executionId]', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockRequireEditableRun.mockResolvedValue({ id: 50, projectId: 1, status: 'CREATED' });
		mockDb.query.testExecution = { findFirst: vi.fn() };
	});

	describe('DELETE', () => {
		it('should return 401 when not authenticated', async () => {
			const event = createMockEvent({ method: 'DELETE', params: PARAMS, user: null });
			await expect(DELETE(event)).rejects.toThrow();
		});

		it('should return 404 when run is not found (via requireEditableRun)', async () => {
			mockRequireEditableRun.mockRejectedValue(Object.assign(new Error(), { status: 404 }));
			const event = createMockEvent({ method: 'DELETE', params: PARAMS, user: testUser });
			await expect(DELETE(event)).rejects.toThrow();
		});

		it('should return 403 when run is completed', async () => {
			mockRequireEditableRun.mockRejectedValue(Object.assign(new Error(), { status: 403 }));
			const event = createMockEvent({ method: 'DELETE', params: PARAMS, user: testUser });
			await expect(DELETE(event)).rejects.toThrow();
		});

		it('should return 404 when execution not found', async () => {
			(mockDb.query.testExecution.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
			const event = createMockEvent({ method: 'DELETE', params: PARAMS, user: testUser });
			await expect(DELETE(event)).rejects.toThrow();
		});

		it('should delete execution and related failures on success', async () => {
			(mockDb.query.testExecution.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(sampleExecution);

			const deleteChain = {
				where: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) => Promise.resolve(undefined).then(r)
			};
			mockDb.delete.mockReturnValue(deleteChain as never);

			const event = createMockEvent({ method: 'DELETE', params: PARAMS, user: testUser });
			const response = await DELETE(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.success).toBe(true);
			// delete called twice: once for failures, once for execution
			expect(mockDb.delete).toHaveBeenCalledTimes(2);
		});
	});
});
