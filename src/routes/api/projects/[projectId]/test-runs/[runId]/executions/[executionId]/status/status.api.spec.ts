import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser, adminUser, sampleTestRun, sampleExecution } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	testExecution: { id: 'id', testRunId: 'test_run_id', testCaseVersionId: 'test_case_version_id', status: 'status', executedBy: 'executed_by', executedAt: 'executed_at' },
	testRun: { id: 'id', projectId: 'project_id', name: 'name', status: 'status', startedAt: 'started_at' },
	testCaseVersion: { id: 'id', testCaseId: 'test_case_id' },
	testCase: { id: 'id', key: 'key' },
	testCaseAssignee: { testCaseId: 'test_case_id', userId: 'user_id' }
}));
vi.mock('$lib/server/notifications', () => ({ createNotification: vi.fn() }));
vi.mock('drizzle-orm', () => ({
	and: vi.fn((...args: unknown[]) => args),
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	sql: Object.assign(
		(strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
		{ raw: (s: string) => s }
	)
}));
vi.mock('$lib/server/auth-utils', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/auth-utils')>('$lib/server/auth-utils');
	return {
		...actual,
		requireProjectRole: vi.fn().mockResolvedValue({ role: 'PROJECT_ADMIN' })
	};
});
vi.mock('$lib/server/redis', () => ({
	publish: vi.fn().mockResolvedValue(undefined)
}));

const { PUT } = await import('./+server');
const authUtils = await import('$lib/server/auth-utils');

const PARAMS = { projectId: '1', runId: '50', executionId: '200' };

describe('/api/projects/[projectId]/test-runs/[runId]/executions/[executionId]/status', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(authUtils.requireProjectRole).mockResolvedValue({ role: 'PROJECT_ADMIN' });
		mockDb.query.testRun.findFirst = vi.fn().mockResolvedValue(sampleTestRun);
		mockDb.query.testExecution = { findFirst: vi.fn().mockResolvedValue(sampleExecution) };
		mockDb.query.testCaseVersion = { findFirst: vi.fn().mockResolvedValue({ id: 1, testCaseId: 10 }) };
		mockDb.query.testCase = { findFirst: vi.fn().mockResolvedValue({ id: 10, key: 'TC-0001' }) };

		const updateChain = {
			set: vi.fn().mockReturnThis(),
			where: vi.fn().mockReturnThis(),
			then: (resolve: (v: unknown) => void) => Promise.resolve(undefined).then(resolve)
		};
		mockDb.update.mockReturnValue(updateChain as never);

		// Mock select for assignee lookup
		const selectChain = {
			from: vi.fn().mockReturnThis(),
			where: vi.fn().mockReturnThis(),
			then: (resolve: (v: unknown) => void) => Promise.resolve([]).then(resolve)
		};
		mockDb.select.mockReturnValue(selectChain as never);
	});

	describe('PUT', () => {
		it('should update execution status to PASS', async () => {
			const event = createMockEvent({
				method: 'PUT',
				params: PARAMS,
				body: { status: 'PASS' },
				user: adminUser
			});
			const response = await PUT(event);
			const body = await response.json();

			expect(response.status).toBe(200);
			expect(body.success).toBe(true);
			expect(body.status).toBe('PASS');
		});

		it('should update execution status to FAIL', async () => {
			const event = createMockEvent({
				method: 'PUT',
				params: PARAMS,
				body: { status: 'FAIL' },
				user: adminUser
			});
			const response = await PUT(event);
			const body = await response.json();

			expect(response.status).toBe(200);
			expect(body.success).toBe(true);
			expect(body.status).toBe('FAIL');
		});

		it('should return 400 for invalid status', async () => {
			const event = createMockEvent({
				method: 'PUT',
				params: PARAMS,
				body: { status: 'INVALID_STATUS' },
				user: adminUser
			});
			await expect(PUT(event)).rejects.toThrow();
		});

		it('should return 403 for VIEWER', async () => {
			vi.mocked(authUtils.requireProjectRole).mockRejectedValue(
				Object.assign(new Error(), { status: 403, body: { message: 'Forbidden' } })
			);

			const event = createMockEvent({
				method: 'PUT',
				params: PARAMS,
				body: { status: 'PASS' },
				user: testUser
			});
			await expect(PUT(event)).rejects.toThrow();
		});

		it('should return 401 when unauthenticated', async () => {
			const event = createMockEvent({
				method: 'PUT',
				params: PARAMS,
				body: { status: 'PASS' },
				user: null
			});
			await expect(PUT(event)).rejects.toThrow();
		});

		it('should return 403 when run is COMPLETED', async () => {
			mockDb.query.testRun.findFirst = vi.fn().mockResolvedValue({
				...sampleTestRun,
				status: 'COMPLETED'
			});

			const event = createMockEvent({
				method: 'PUT',
				params: PARAMS,
				body: { status: 'PASS' },
				user: adminUser
			});
			await expect(PUT(event)).rejects.toThrow();
		});

		it('should return 404 when run not found', async () => {
			mockDb.query.testRun.findFirst = vi.fn().mockResolvedValue(null);

			const event = createMockEvent({
				method: 'PUT',
				params: PARAMS,
				body: { status: 'PASS' },
				user: adminUser
			});
			await expect(PUT(event)).rejects.toThrow();
		});

		it('should return 404 when execution not found', async () => {
			mockDb.query.testExecution = { findFirst: vi.fn().mockResolvedValue(null) };

			const event = createMockEvent({
				method: 'PUT',
				params: PARAMS,
				body: { status: 'PASS' },
				user: adminUser
			});
			await expect(PUT(event)).rejects.toThrow();
		});

		it('should accept all valid statuses', async () => {
			const validStatuses = ['PASS', 'FAIL', 'BLOCKED', 'SKIPPED', 'PENDING'];
			for (const status of validStatuses) {
				vi.clearAllMocks();
				mockDb.query.testRun.findFirst = vi.fn().mockResolvedValue(sampleTestRun);
				mockDb.query.testExecution = { findFirst: vi.fn().mockResolvedValue(sampleExecution) };
				mockDb.query.testCaseVersion = { findFirst: vi.fn().mockResolvedValue({ id: 1, testCaseId: 10 }) };
				mockDb.query.testCase = { findFirst: vi.fn().mockResolvedValue({ id: 10, key: 'TC-0001' }) };

				const updateChain = {
					set: vi.fn().mockReturnThis(),
					where: vi.fn().mockReturnThis(),
					then: (resolve: (v: unknown) => void) => Promise.resolve(undefined).then(resolve)
				};
				mockDb.update.mockReturnValue(updateChain as never);

				const selectChain = {
					from: vi.fn().mockReturnThis(),
					where: vi.fn().mockReturnThis(),
					then: (resolve: (v: unknown) => void) => Promise.resolve([]).then(resolve)
				};
				mockDb.select.mockReturnValue(selectChain as never);

				const event = createMockEvent({
					method: 'PUT',
					params: PARAMS,
					body: { status },
					user: adminUser
				});
				const response = await PUT(event);
				const body = await response.json();

				expect(response.status).toBe(200);
				expect(body.status).toBe(status);
			}
		});
	});
});
