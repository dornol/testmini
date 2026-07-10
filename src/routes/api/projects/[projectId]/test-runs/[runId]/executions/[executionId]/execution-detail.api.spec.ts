import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser, sampleExecution } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();
const mockRequireEditableRun = vi
	.fn()
	.mockResolvedValue({ id: 50, projectId: 1, status: 'CREATED' });

vi.mock('$lib/server/db', () => ({ db: mockDb, col: mockDb.col, sql: mockDb.sql }));
vi.mock('$lib/server/db/schema', () => ({
	testExecution: { id: 'id', testRunId: 'test_run_id' },
	testFailureDetail: { id: 'id', testExecutionId: 'test_execution_id' }
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	and: vi.fn((...args: unknown[]) => args),
	sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }))
}));
vi.mock('$lib/server/auth-utils', async () => {
	const actual =
		await vi.importActual<typeof import('$lib/server/auth-utils')>('$lib/server/auth-utils');
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

function mockTransactionDeleteResults(...results: unknown[][]) {
	let deleteCall = 0;
	const deleteChains: Array<{
		where: ReturnType<typeof vi.fn>;
		returning: ReturnType<typeof vi.fn>;
	}> = [];
	const tx = {
		delete: vi.fn(() => {
			const chain = {
				where: vi.fn().mockReturnThis(),
				returning: vi.fn().mockResolvedValue(results[deleteCall++] ?? [])
			};
			deleteChains.push(chain);
			return chain;
		})
	};
	mockDb.transaction.mockImplementation(async (fn: (txArg: typeof tx) => Promise<unknown>) =>
		fn(tx)
	);
	return { tx, deleteChains };
}

describe('/api/projects/[projectId]/test-runs/[runId]/executions/[executionId]', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockRequireEditableRun.mockResolvedValue({ id: 50, projectId: 1, status: 'CREATED' });
		mockDb.query.testExecution = { findFirst: vi.fn() };
		mockTransactionDeleteResults([], [sampleExecution]);
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
			(mockDb.query.testExecution.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
				sampleExecution
			);
			const { deleteChains } = mockTransactionDeleteResults([], [sampleExecution]);

			const event = createMockEvent({ method: 'DELETE', params: PARAMS, user: testUser });
			const response = await DELETE(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.success).toBe(true);
			expect(mockDb.transaction).toHaveBeenCalledTimes(1);
			expect(mockDb.delete).not.toHaveBeenCalled();
			expect(deleteChains[0].where).toHaveBeenCalledWith(
				expect.arrayContaining([
					['test_execution_id', 200],
					expect.objectContaining({ values: [50, 1] })
				])
			);
			expect(deleteChains[1].where).toHaveBeenCalledWith(
				expect.arrayContaining([
					['id', 200],
					['test_run_id', 50],
					expect.objectContaining({ values: [50, 1] })
				])
			);
		});

		it('should return 404 when execution disappears before delete', async () => {
			(mockDb.query.testExecution.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
				sampleExecution
			);
			mockTransactionDeleteResults([], []);

			const event = createMockEvent({ method: 'DELETE', params: PARAMS, user: testUser });
			await expect(DELETE(event)).rejects.toMatchObject({ status: 404 });
			expect(mockDb.transaction).toHaveBeenCalledTimes(1);
		});
	});
});
