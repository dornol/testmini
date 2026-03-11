import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockSelectResult, mockUpdateReturning } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser, adminUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	release: {
		id: 'id',
		name: 'name',
		version: 'version',
		description: 'description',
		status: 'status',
		targetDate: 'target_date',
		releaseDate: 'release_date',
		projectId: 'project_id',
		createdBy: 'created_by',
		createdAt: 'created_at',
		updatedAt: 'updated_at'
	},
	testPlan: { id: 'id', name: 'name', status: 'status', milestone: 'milestone', releaseId: 'release_id' },
	testRun: { id: 'id', name: 'name', status: 'status', environment: 'environment', releaseId: 'release_id', createdAt: 'created_at' },
	testExecution: { id: 'id', testRunId: 'test_run_id', status: 'status' },
	user: { id: 'id', name: 'name' },
	testPlanTestCase: { id: 'id', testPlanId: 'test_plan_id' },
	testCase: { id: 'id' },
	testCaseVersion: { id: 'id' }
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	and: vi.fn((...args: unknown[]) => args),
	sql: Object.assign(
		(strings: TemplateStringsArray, ...values: unknown[]) => ({
			as: () => ({ sql: strings, values })
		}),
		{ raw: (s: string) => s }
	)
}));
vi.mock('$lib/server/auth-utils', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/auth-utils')>('$lib/server/auth-utils');
	return {
		...actual,
		requireProjectAccess: vi.fn().mockResolvedValue({ role: 'QA' }),
		requireProjectRole: vi.fn().mockResolvedValue({ role: 'PROJECT_ADMIN' })
	};
});

const { GET, PATCH, DELETE } = await import('./+server');
const authUtils = await import('$lib/server/auth-utils');

const PARAMS = { projectId: '1', releaseId: '300' };

const sampleRelease = {
	id: 300,
	projectId: 1,
	name: 'v1.0.0',
	version: '1.0.0',
	description: 'First release',
	status: 'PLANNING',
	targetDate: null,
	releaseDate: null,
	createdBy: 'user-1',
	createdAt: new Date('2025-01-01'),
	updatedAt: new Date('2025-01-01')
};

describe('/api/projects/[projectId]/releases/[releaseId]', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(authUtils.requireProjectAccess).mockResolvedValue({ role: 'QA' });
		vi.mocked(authUtils.requireProjectRole).mockResolvedValue({ role: 'PROJECT_ADMIN' });
		(mockDb.query as Record<string, { findFirst: ReturnType<typeof vi.fn> }>).release = {
			findFirst: vi.fn().mockResolvedValue(sampleRelease)
		};
	});

	describe('GET', () => {
		it('should return release detail with plans, runs, and stats', async () => {
			let selectCall = 0;
			mockDb.select.mockImplementation(() => {
				selectCall++;
				if (selectCall === 1) {
					// creator query
					return {
						from: vi.fn().mockReturnThis(),
						where: vi.fn().mockReturnThis(),
						then: (r: (v: unknown) => void) => Promise.resolve([{ name: 'Test User' }]).then(r)
					} as never;
				} else if (selectCall === 2) {
					// plans query
					return {
						from: vi.fn().mockReturnThis(),
						where: vi.fn().mockReturnThis(),
						then: (r: (v: unknown) => void) =>
							Promise.resolve([{ id: 1, name: 'Plan 1', status: 'ACTIVE', milestone: 'v1', itemCount: 5 }]).then(r)
					} as never;
				} else {
					// runs query
					return {
						from: vi.fn().mockReturnThis(),
						where: vi.fn().mockReturnThis(),
						then: (r: (v: unknown) => void) =>
							Promise.resolve([
								{ id: 50, name: 'Run 1', status: 'COMPLETED', environment: 'QA', createdAt: new Date(), total: 10, pass: 8, fail: 1, blocked: 1 }
							]).then(r)
					} as never;
				}
			});

			const event = createMockEvent({ method: 'GET', params: PARAMS, user: testUser });
			const response = await GET(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.id).toBe(300);
			expect(data.name).toBe('v1.0.0');
			expect(data.createdByName).toBe('Test User');
			expect(Array.isArray(data.plans)).toBe(true);
			expect(Array.isArray(data.runs)).toBe(true);
			expect(data.stats).toBeDefined();
			expect(data.stats.total).toBe(10);
			expect(data.stats.pass).toBe(8);
			expect(data.stats.passRate).toBe(80);
		});

		it('should return 404 when release not found', async () => {
			(mockDb.query as Record<string, { findFirst: ReturnType<typeof vi.fn> }>).release.findFirst.mockResolvedValue(null);

			const event = createMockEvent({ method: 'GET', params: PARAMS, user: testUser });
			const response = await GET(event);

			expect(response.status).toBe(404);
		});

		it('should reject invalid release ID', async () => {
			const event = createMockEvent({
				method: 'GET',
				params: { projectId: '1', releaseId: 'abc' },
				user: testUser
			});
			await expect(GET(event)).rejects.toThrow();
		});

		it('should return 401 when unauthenticated', async () => {
			const event = createMockEvent({ method: 'GET', params: PARAMS, user: null });
			await expect(GET(event)).rejects.toThrow();
		});
	});

	describe('PATCH', () => {
		it('should update release name', async () => {
			const updated = { ...sampleRelease, name: 'v1.1.0' };
			mockUpdateReturning(mockDb, [updated]);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { name: 'v1.1.0' },
				user: testUser
			});
			const response = await PATCH(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.name).toBe('v1.1.0');
		});

		it('should update release status', async () => {
			const updated = { ...sampleRelease, status: 'IN_PROGRESS' };
			mockUpdateReturning(mockDb, [updated]);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { status: 'IN_PROGRESS' },
				user: testUser
			});
			const response = await PATCH(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.status).toBe('IN_PROGRESS');
		});

		it('should update version, description, and dates', async () => {
			const updated = {
				...sampleRelease,
				version: '2.0.0',
				description: 'Updated',
				targetDate: new Date('2025-06-01')
			};
			mockUpdateReturning(mockDb, [updated]);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { version: '2.0.0', description: 'Updated', targetDate: '2025-06-01' },
				user: testUser
			});
			const response = await PATCH(event);

			expect(response.status).toBe(200);
		});

		it('should return 400 when no fields to update', async () => {
			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: {},
				user: testUser
			});
			const response = await PATCH(event);

			expect(response.status).toBe(400);
			const data = await response.json();
			expect(data.error).toBe('No fields to update');
		});

		it('should return 400 for invalid status value', async () => {
			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { status: 'NONEXISTENT' },
				user: testUser
			});
			const response = await PATCH(event);

			expect(response.status).toBe(400);
		});

		it('should return 404 when release not found', async () => {
			(mockDb.query as Record<string, { findFirst: ReturnType<typeof vi.fn> }>).release.findFirst.mockResolvedValue(null);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { name: 'New' },
				user: testUser
			});
			const response = await PATCH(event);

			expect(response.status).toBe(404);
		});

		it('should return 403 for insufficient role', async () => {
			vi.mocked(authUtils.requireProjectRole).mockRejectedValue(
				Object.assign(new Error(), { status: 403, body: { message: 'Forbidden' } })
			);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { name: 'New' },
				user: testUser
			});
			await expect(PATCH(event)).rejects.toThrow();
		});
	});

	describe('DELETE', () => {
		it('should delete release successfully', async () => {
			const deleteChain = {
				where: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) => Promise.resolve(undefined).then(r)
			};
			mockDb.delete.mockReturnValue(deleteChain as never);

			const event = createMockEvent({
				method: 'DELETE',
				params: PARAMS,
				user: adminUser
			});
			const response = await DELETE(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.success).toBe(true);
		});

		it('should return 404 when release not found', async () => {
			(mockDb.query as Record<string, { findFirst: ReturnType<typeof vi.fn> }>).release.findFirst.mockResolvedValue(null);

			const event = createMockEvent({
				method: 'DELETE',
				params: PARAMS,
				user: adminUser
			});
			const response = await DELETE(event);

			expect(response.status).toBe(404);
		});

		it('should return 403 for non-PROJECT_ADMIN', async () => {
			vi.mocked(authUtils.requireProjectRole).mockRejectedValue(
				Object.assign(new Error(), { status: 403, body: { message: 'Forbidden' } })
			);

			const event = createMockEvent({
				method: 'DELETE',
				params: PARAMS,
				user: testUser
			});
			await expect(DELETE(event)).rejects.toThrow();
		});

		it('should reject invalid release ID', async () => {
			const event = createMockEvent({
				method: 'DELETE',
				params: { projectId: '1', releaseId: 'abc' },
				user: adminUser
			});
			await expect(DELETE(event)).rejects.toThrow();
		});
	});
});
