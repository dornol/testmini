import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser, sampleTestRun, sampleExecution } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	testRun: { id: 'id', projectId: 'project_id', name: 'name', environment: 'environment', createdBy: 'created_by' },
	testExecution: { id: 'id', testRunId: 'test_run_id', testCaseVersionId: 'test_case_version_id' },
	testCaseVersion: { id: 'id', testCaseId: 'test_case_id' },
	testCase: { id: 'id', latestVersionId: 'latest_version_id' }
}));
vi.mock('drizzle-orm', () => ({
	and: vi.fn((...args: unknown[]) => args),
	eq: vi.fn((a: unknown, b: unknown) => [a, b])
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

describe('/api/projects/[projectId]/test-runs/[runId]/clone', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(authUtils.requireProjectRole).mockResolvedValue({ role: 'QA' });
	});

	describe('POST', () => {
		it('should return 401 when unauthenticated', async () => {
			const event = createMockEvent({ method: 'POST', params: PARAMS, user: null });
			await expect(POST(event)).rejects.toThrow();
		});

		it('should return 403 for VIEWER', async () => {
			vi.mocked(authUtils.requireProjectRole).mockRejectedValue(
				Object.assign(new Error('Forbidden'), { status: 403 })
			);
			const event = createMockEvent({ method: 'POST', params: PARAMS, user: testUser });
			await expect(POST(event)).rejects.toThrow();
		});

		it('should clone test run for non-VIEWER', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(sampleTestRun);

			const execRow = { testCaseId: 10, latestVersionId: 100 };
			const selectChain = {
				from: vi.fn().mockReturnThis(),
				innerJoin: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) => Promise.resolve([execRow]).then(r)
			};
			mockDb.select.mockReturnValue(selectChain as never);

			const newRun = { ...sampleTestRun, id: 51, name: `Copy of ${sampleTestRun.name}` };
			mockDb.transaction.mockImplementation(async (fn) => {
				const txInsertRunChain = {
					values: vi.fn().mockReturnThis(),
					returning: vi.fn().mockResolvedValue([newRun])
				};
				const txInsertExecChain = {
					values: vi.fn().mockReturnThis(),
					then: (r: (v: unknown) => void) => Promise.resolve(undefined).then(r)
				};

				let insertCallCount = 0;
				const tx = {
					insert: vi.fn().mockImplementation(() => {
						insertCallCount++;
						if (insertCallCount === 1) return txInsertRunChain;
						return txInsertExecChain;
					})
				};
				return fn(tx);
			});

			const event = createMockEvent({ method: 'POST', params: PARAMS, user: testUser });
			const response = await POST(event);
			const body = await response.json();

			expect(response.status).toBe(200);
			expect(body.id).toBe(newRun.id);
		});

		it('should use custom name when provided in request body', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(sampleTestRun);

			const selectChain = {
				from: vi.fn().mockReturnThis(),
				innerJoin: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) => Promise.resolve([]).then(r)
			};
			mockDb.select.mockReturnValue(selectChain as never);

			const customName = 'My Cloned Run';
			const newRun = { ...sampleTestRun, id: 51, name: customName };
			mockDb.transaction.mockImplementation(async (fn) => {
				const txInsertChain = {
					values: vi.fn().mockReturnThis(),
					returning: vi.fn().mockResolvedValue([newRun])
				};
				const tx = { insert: vi.fn().mockReturnValue(txInsertChain) };
				return fn(tx);
			});

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { name: customName },
				user: testUser
			});
			const response = await POST(event);
			const body = await response.json();

			expect(response.status).toBe(200);
			expect(body.id).toBe(newRun.id);
		});

		it('should return 404 when test run not found', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(null);
			const event = createMockEvent({ method: 'POST', params: PARAMS, user: testUser });
			await expect(POST(event)).rejects.toThrow();
		});
	});
});
