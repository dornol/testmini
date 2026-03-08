import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockSelectResult } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser, adminUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();
// The detail endpoint uses db.query.testPlan.findFirst
(mockDb.query as Record<string, unknown>).testPlan = { findFirst: vi.fn() };

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	testPlan: {
		id: 'id',
		name: 'name',
		description: 'description',
		status: 'status',
		milestone: 'milestone',
		startDate: 'start_date',
		endDate: 'end_date',
		projectId: 'project_id',
		createdBy: 'created_by',
		createdAt: 'created_at'
	},
	testPlanTestCase: {
		id: 'id',
		testPlanId: 'test_plan_id',
		testCaseId: 'test_case_id',
		position: 'position'
	},
	testCase: { id: 'id', key: 'key', latestVersionId: 'latest_version_id' },
	testCaseVersion: { id: 'id', title: 'title', priority: 'priority' },
	testRun: {
		id: 'id',
		name: 'name',
		status: 'status',
		environment: 'environment',
		testPlanId: 'test_plan_id',
		createdAt: 'created_at'
	},
	user: { id: 'id', name: 'name' }
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

const PARAMS = { projectId: '1', planId: '1' };

const samplePlan = {
	id: 1,
	projectId: 1,
	name: 'Sprint 1 Plan',
	description: 'Test plan for sprint 1',
	status: 'DRAFT',
	milestone: 'v1.0',
	startDate: new Date('2025-01-01'),
	endDate: new Date('2025-01-31'),
	createdBy: 'user-1',
	createdAt: new Date('2025-01-01')
};

const sampleItems = [
	{ id: 1, testCaseId: 10, key: 'TC-0001', title: 'Login should work', priority: 'MEDIUM', position: 0 }
];

const sampleRuns = [
	{ id: 50, name: 'Sprint 1 Run', status: 'CREATED', environment: 'QA', createdAt: new Date('2025-01-01') }
];

describe('/api/projects/[projectId]/test-plans/[planId]', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(authUtils.requireProjectAccess).mockResolvedValue({ role: 'QA' });
		vi.mocked(authUtils.requireProjectRole).mockResolvedValue({ role: 'PROJECT_ADMIN' });
		vi.mocked(
			(mockDb.query as Record<string, { findFirst: ReturnType<typeof vi.fn> }>).testPlan.findFirst
		).mockResolvedValue(samplePlan);
	});

	describe('GET', () => {
		it('should return plan detail with items and runs', async () => {
			// First select returns creator, second returns items, third returns runs
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
					// items query
					return {
						from: vi.fn().mockReturnThis(),
						innerJoin: vi.fn().mockReturnThis(),
						where: vi.fn().mockReturnThis(),
						orderBy: vi.fn().mockReturnThis(),
						then: (r: (v: unknown) => void) => Promise.resolve(sampleItems).then(r)
					} as never;
				} else {
					// runs query
					return {
						from: vi.fn().mockReturnThis(),
						where: vi.fn().mockReturnThis(),
						orderBy: vi.fn().mockReturnThis(),
						then: (r: (v: unknown) => void) => Promise.resolve(sampleRuns).then(r)
					} as never;
				}
			});

			const event = createMockEvent({
				method: 'GET',
				params: PARAMS,
				user: testUser
			});
			const response = await GET(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.id).toBe(1);
			expect(data.name).toBe('Sprint 1 Plan');
			expect(data.createdByName).toBe('Test User');
			expect(Array.isArray(data.items)).toBe(true);
			expect(Array.isArray(data.runs)).toBe(true);
		});

		it('should return 404 when plan not found', async () => {
			vi.mocked(
				(mockDb.query as Record<string, { findFirst: ReturnType<typeof vi.fn> }>).testPlan.findFirst
			).mockResolvedValue(null);

			const event = createMockEvent({
				method: 'GET',
				params: PARAMS,
				user: testUser
			});
			await expect(GET(event)).rejects.toThrow();
		});

		it('should return 401 when unauthenticated', async () => {
			const event = createMockEvent({
				method: 'GET',
				params: PARAMS,
				user: null
			});
			await expect(GET(event)).rejects.toThrow();
		});
	});

	describe('PATCH', () => {
		it('should update plan name', async () => {
			const updatedPlan = { ...samplePlan, name: 'Updated Plan' };
			vi.mocked(
				(mockDb.query as Record<string, { findFirst: ReturnType<typeof vi.fn> }>).testPlan.findFirst
			)
				.mockResolvedValueOnce(samplePlan)
				.mockResolvedValueOnce(updatedPlan);

			const updateChain = {
				set: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) => Promise.resolve(undefined).then(r)
			};
			mockDb.update.mockReturnValue(updateChain as never);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { name: 'Updated Plan' },
				user: testUser
			});
			const response = await PATCH(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.name).toBe('Updated Plan');
		});

		it('should update plan status', async () => {
			const updatedPlan = { ...samplePlan, status: 'ACTIVE' };
			vi.mocked(
				(mockDb.query as Record<string, { findFirst: ReturnType<typeof vi.fn> }>).testPlan.findFirst
			)
				.mockResolvedValueOnce(samplePlan)
				.mockResolvedValueOnce(updatedPlan);

			const updateChain = {
				set: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) => Promise.resolve(undefined).then(r)
			};
			mockDb.update.mockReturnValue(updateChain as never);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { status: 'ACTIVE' },
				user: testUser
			});
			const response = await PATCH(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.status).toBe('ACTIVE');
		});

		it('should update milestone and dates', async () => {
			const updatedPlan = { ...samplePlan, milestone: 'v2.0', startDate: new Date('2025-02-01'), endDate: new Date('2025-02-28') };
			vi.mocked(
				(mockDb.query as Record<string, { findFirst: ReturnType<typeof vi.fn> }>).testPlan.findFirst
			)
				.mockResolvedValueOnce(samplePlan)
				.mockResolvedValueOnce(updatedPlan);

			const updateChain = {
				set: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) => Promise.resolve(undefined).then(r)
			};
			mockDb.update.mockReturnValue(updateChain as never);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { milestone: 'v2.0', startDate: '2025-02-01', endDate: '2025-02-28' },
				user: testUser
			});
			const response = await PATCH(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.milestone).toBe('v2.0');
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

		it('should return 400 for invalid status', async () => {
			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { status: 'INVALID_STATUS' },
				user: testUser
			});
			const response = await PATCH(event);

			expect(response.status).toBe(400);
			const data = await response.json();
			expect(data.error).toBe('Invalid input');
		});

		it('should return 404 when plan not found', async () => {
			vi.mocked(
				(mockDb.query as Record<string, { findFirst: ReturnType<typeof vi.fn> }>).testPlan.findFirst
			).mockResolvedValue(null);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { name: 'New Name' },
				user: testUser
			});
			await expect(PATCH(event)).rejects.toThrow();
		});

		it('should return 403 for non-admin roles', async () => {
			vi.mocked(authUtils.requireProjectRole).mockRejectedValue(
				Object.assign(new Error(), { status: 403, body: { message: 'Forbidden' } })
			);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { name: 'New Name' },
				user: testUser
			});
			await expect(PATCH(event)).rejects.toThrow();
		});
	});

	describe('DELETE', () => {
		it('should delete plan', async () => {
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

		it('should return 404 when plan not found', async () => {
			vi.mocked(
				(mockDb.query as Record<string, { findFirst: ReturnType<typeof vi.fn> }>).testPlan.findFirst
			).mockResolvedValue(null);

			const event = createMockEvent({
				method: 'DELETE',
				params: PARAMS,
				user: adminUser
			});
			await expect(DELETE(event)).rejects.toThrow();
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

		it('should return 401 when not authenticated', async () => {
			const event = createMockEvent({
				method: 'DELETE',
				params: PARAMS,
				user: null
			});
			await expect(DELETE(event)).rejects.toThrow();
		});
	});
});
