import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { adminUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb, col: mockDb.col, sql: mockDb.sql }));
vi.mock('$lib/server/db/schema', () => ({
	testRun: { id: 'id', name: 'name', environment: 'environment', projectId: 'project_id' },
	testExecution: {
		id: 'id',
		testRunId: 'test_run_id',
		testCaseVersionId: 'test_case_version_id',
		status: 'status',
		comment: 'comment',
		executedBy: 'executed_by',
		executedAt: 'executed_at'
	},
	testCaseVersion: { id: 'id', testCaseId: 'test_case_id', title: 'title', priority: 'priority' },
	testCase: { id: 'id', projectId: 'project_id', key: 'key' },
	testFailureDetail: { testExecutionId: 'test_execution_id', errorMessage: 'error_message' },
	user: { id: 'id', name: 'name' },
	projectMember: { projectId: 'project_id', userId: 'user_id', role: 'role' }
}));
vi.mock('drizzle-orm', () => ({
	and: vi.fn((...args: unknown[]) => args),
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	gt: vi.fn((a: unknown, b: unknown) => ['gt', a, b]),
	inArray: vi.fn((a: unknown, b: unknown) => ['inArray', a, b]),
	sql: Object.assign(
		(strings: TemplateStringsArray, ...values: unknown[]) => ({
			as: () => ({ sql: strings, values })
		}),
		{ raw: (s: string) => s }
	)
}));
vi.mock('$lib/server/auth-utils', async () => {
	const actual =
		await vi.importActual<typeof import('$lib/server/auth-utils')>('$lib/server/auth-utils');
	return {
		...actual,
		requireProjectAccess: vi.fn().mockResolvedValue({ role: 'PROJECT_ADMIN' })
	};
});

// Import after mocks
const { GET } = await import('./+server');

describe('/api/projects/[projectId]/reports/export', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('GET', () => {
		it('should return 400 when run IDs exceed 20', async () => {
			const runIds = Array.from({ length: 21 }, (_, i) => i + 1).join(',');

			const event = createMockEvent({
				method: 'GET',
				params: { projectId: '1' },
				searchParams: { runs: runIds },
				user: adminUser
			});
			await expect(GET(event)).rejects.toThrow();
		});

		it('should return 400 when runs param is missing', async () => {
			const event = createMockEvent({
				method: 'GET',
				params: { projectId: '1' },
				user: adminUser
			});
			await expect(GET(event)).rejects.toThrow();
		});

		it('should return 400 when runs param is empty', async () => {
			const event = createMockEvent({
				method: 'GET',
				params: { projectId: '1' },
				searchParams: { runs: '' },
				user: adminUser
			});
			await expect(GET(event)).rejects.toThrow();
		});

		it('should reject invalid run ID tokens before querying', async () => {
			for (const runs of [
				'1,abc,2',
				'1,1.5,2',
				'1,0,2',
				'1,01,2',
				'1,1e3,2',
				'1, 2',
				'1,2 ',
				'1,,2',
				`1,${Number.MAX_SAFE_INTEGER + 1}`
			]) {
				vi.clearAllMocks();
				const event = createMockEvent({
					method: 'GET',
					params: { projectId: '1' },
					searchParams: { runs },
					user: adminUser
				});

				await expect(GET(event)).rejects.toThrow();
				expect(mockDb.select).not.toHaveBeenCalled();
			}
		});

		it('should deduplicate run IDs before verifying project scope', async () => {
			const where = vi.fn().mockReturnThis();
			mockDb.select.mockImplementationOnce(
				() =>
					({
						from: vi.fn().mockReturnThis(),
						where,
						then: (r: (v: unknown) => void) =>
							Promise.resolve([
								{ id: 1, name: 'Run 1', environment: 'QA' },
								{ id: 2, name: 'Run 2', environment: 'STAGING' }
							]).then(r)
					}) as never
			);

			const event = createMockEvent({
				method: 'GET',
				params: { projectId: '1' },
				searchParams: { runs: '1,1,2,2' },
				user: adminUser
			});

			const response = await GET(event);

			expect(response.status).toBe(200);
			expect(where).toHaveBeenCalledWith([
				['inArray', 'id', [1, 2]],
				['project_id', 1]
			]);
		});

		it('should scope streamed execution rows to test cases in the project', async () => {
			mockDb.select.mockImplementationOnce(
				() =>
					({
						from: vi.fn().mockReturnThis(),
						where: vi.fn().mockReturnThis(),
						then: (r: (v: unknown) => void) =>
							Promise.resolve([{ id: 1, name: 'Run 1', environment: 'QA' }]).then(r)
					}) as never
			);

			const executionWhere = vi.fn().mockReturnThis();
			let streamSelectCount = 0;
			const makeStreamSelect = (result: unknown[]) => ({
				from: vi.fn().mockReturnThis(),
				innerJoin: vi.fn().mockReturnThis(),
				leftJoin: vi.fn().mockReturnThis(),
				where: streamSelectCount === 1 ? executionWhere : vi.fn().mockReturnThis(),
				orderBy: vi.fn().mockReturnThis(),
				limit: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) => Promise.resolve(result).then(r)
			});

			mockDb.select.mockImplementation(() => {
				streamSelectCount++;
				if (streamSelectCount === 1) {
					return makeStreamSelect([
						{
							id: 10,
							testRunId: 1,
							testCaseKey: 'TC-1',
							testCaseTitle: 'Login',
							priority: 'HIGH',
							status: 'PASS',
							comment: null,
							executedBy: 'QA',
							executedAt: null
						}
					]) as never;
				}
				return makeStreamSelect([]) as never;
			});

			const event = createMockEvent({
				method: 'GET',
				params: { projectId: '1' },
				searchParams: { runs: '1' },
				user: adminUser
			});

			const response = await GET(event);
			await response.text();

			expect(executionWhere).toHaveBeenCalledWith(
				expect.arrayContaining([
					['test_run_id', 1],
					['project_id', 1],
					['gt', 'id', 0]
				])
			);
		});
	});
});
