import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockSelectResult, mockUpdateReturning } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	testCycle: {
		id: 'id', projectId: 'project_id', name: 'name', cycleNumber: 'cycle_number',
		status: 'status', releaseId: 'release_id', startDate: 'start_date',
		endDate: 'end_date', createdBy: 'created_by', createdAt: 'created_at',
		updatedAt: 'updated_at'
	},
	testRun: { id: 'id', testCycleId: 'test_cycle_id', name: 'name', environment: 'environment', status: 'status', createdAt: 'created_at' },
	testExecution: { id: 'id', testRunId: 'test_run_id', status: 'status' },
	user: { id: 'id', name: 'name' }
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	and: vi.fn((...args: unknown[]) => args),
	sql: Object.assign(
		(strings: TemplateStringsArray, ...values: unknown[]) => ({ as: () => ({ sql: strings, values }) }),
		{ raw: (s: string) => s }
	)
}));

vi.mock('$lib/server/auth-utils', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/auth-utils')>('$lib/server/auth-utils');
	return {
		...actual,
		requireProjectRole: vi.fn().mockResolvedValue({ role: 'PROJECT_ADMIN' }),
		requireProjectAccess: vi.fn().mockResolvedValue({ role: 'PROJECT_ADMIN' })
	};
});

const { GET, PUT, DELETE } = await import('./+server');

describe('/api/projects/[projectId]/test-cycles/[cycleId]', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('GET', () => {
		it('should return cycle detail with runs', async () => {
			// First select for cycle detail, second for runs
			const cycleData = { id: 1, name: 'Cycle 1', cycleNumber: 1, status: 'PLANNED', createdBy: 'Test User' };
			const runsData = [{ id: 10, name: 'Run 1', environment: 'QA', status: 'COMPLETED', total: 5, passed: 4, failed: 1 }];
			mockDb.select
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						innerJoin: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								then: (r: (v: unknown) => void) => Promise.resolve([cycleData]).then(r)
							})
						})
					})
				} as never)
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						leftJoin: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								groupBy: vi.fn().mockReturnValue({
									orderBy: vi.fn().mockReturnValue({
										then: (r: (v: unknown) => void) => Promise.resolve(runsData).then(r)
									})
								})
							})
						})
					})
				} as never);

			const event = createMockEvent({
				params: { projectId: '1', cycleId: '1' },
				user: testUser
			});
			const response = await GET(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.name).toBe('Cycle 1');
			expect(data.runs).toHaveLength(1);
			expect(data.summary.passRate).toBe(80);
		});

		it('should return 404 for non-existent cycle', async () => {
			mockSelectResult(mockDb, []);

			const event = createMockEvent({
				params: { projectId: '1', cycleId: '999' },
				user: testUser
			});
			const response = await GET(event);
			expect(response.status).toBe(404);
		});
	});

	describe('PUT', () => {
		it('should update cycle', async () => {
			mockUpdateReturning(mockDb, [{ id: 1, name: 'Updated', status: 'IN_PROGRESS' }]);

			const event = createMockEvent({
				method: 'PUT',
				params: { projectId: '1', cycleId: '1' },
				body: { name: 'Updated', status: 'IN_PROGRESS' },
				user: testUser
			});
			const response = await PUT(event);
			expect(response.status).toBe(200);
		});

		it('should return 400 for empty update', async () => {
			const event = createMockEvent({
				method: 'PUT',
				params: { projectId: '1', cycleId: '1' },
				body: {},
				user: testUser
			});
			const response = await PUT(event);
			expect(response.status).toBe(400);
		});

		it('should return 404 for non-existent cycle', async () => {
			mockUpdateReturning(mockDb, []);

			const event = createMockEvent({
				method: 'PUT',
				params: { projectId: '1', cycleId: '999' },
				body: { name: 'Updated' },
				user: testUser
			});
			const response = await PUT(event);
			expect(response.status).toBe(404);
		});
	});

	describe('DELETE', () => {
		it('should delete cycle', async () => {
			const chain = {
				where: vi.fn().mockReturnValue({
					returning: vi.fn().mockReturnValue({
						then: (r: (v: unknown) => void) => Promise.resolve([{ id: 1 }]).then(r)
					})
				})
			};
			mockDb.delete.mockReturnValue(chain as never);

			const event = createMockEvent({
				method: 'DELETE',
				params: { projectId: '1', cycleId: '1' },
				user: testUser
			});
			const response = await DELETE(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.success).toBe(true);
		});

		it('should return 404 for non-existent cycle', async () => {
			const chain = {
				where: vi.fn().mockReturnValue({
					returning: vi.fn().mockReturnValue({
						then: (r: (v: unknown) => void) => Promise.resolve([]).then(r)
					})
				})
			};
			mockDb.delete.mockReturnValue(chain as never);

			const event = createMockEvent({
				method: 'DELETE',
				params: { projectId: '1', cycleId: '999' },
				user: testUser
			});
			const response = await DELETE(event);
			expect(response.status).toBe(404);
		});
	});
});
