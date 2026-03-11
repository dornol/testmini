import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockSelectResult, mockInsertReturning } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser, adminUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();
const mockCreateNotification = vi.fn();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	testPlan: { id: 'id', name: 'name', projectId: 'project_id', createdBy: 'created_by' },
	testPlanSignoff: {
		id: 'id',
		testPlanId: 'test_plan_id',
		userId: 'user_id',
		decision: 'decision',
		comment: 'comment',
		createdAt: 'created_at'
	},
	user: { id: 'id', name: 'name' },
	projectMember: { userId: 'user_id', projectId: 'project_id', role: 'role' }
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	and: vi.fn((...args: unknown[]) => args)
}));
vi.mock('$lib/server/auth-utils', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/auth-utils')>('$lib/server/auth-utils');
	return {
		...actual,
		requireProjectAccess: vi.fn().mockResolvedValue({ role: 'QA' }),
		requireProjectRole: vi.fn().mockResolvedValue({ role: 'PROJECT_ADMIN' })
	};
});
vi.mock('$lib/server/notifications', () => ({
	createNotification: mockCreateNotification
}));

const { GET, POST } = await import('./+server');
const authUtils = await import('$lib/server/auth-utils');

const PARAMS = { projectId: '1', planId: '1' };

const samplePlan = {
	id: 1,
	projectId: 1,
	name: 'Sprint 1 Plan',
	status: 'ACTIVE',
	createdBy: 'user-1',
	createdAt: new Date('2025-01-01')
};

const sampleSignoffs = [
	{
		id: 1,
		decision: 'APPROVED',
		comment: 'Looks good',
		createdAt: new Date('2025-01-15'),
		userId: 'admin-1',
		userName: 'Admin User'
	}
];

describe('/api/projects/[projectId]/test-plans/[planId]/signoffs', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(authUtils.requireProjectAccess).mockResolvedValue({ role: 'QA' });
		vi.mocked(authUtils.requireProjectRole).mockResolvedValue({ role: 'PROJECT_ADMIN' });
		(mockDb.query as Record<string, { findFirst: ReturnType<typeof vi.fn> }>).testPlan = {
			findFirst: vi.fn().mockResolvedValue(samplePlan)
		};
	});

	describe('GET', () => {
		it('should return list of signoffs', async () => {
			mockSelectResult(mockDb, sampleSignoffs);

			const event = createMockEvent({ method: 'GET', params: PARAMS, user: testUser });
			const response = await GET(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(Array.isArray(data)).toBe(true);
			expect(data[0].decision).toBe('APPROVED');
			expect(data[0].userName).toBe('Admin User');
		});

		it('should return empty array when no signoffs', async () => {
			mockSelectResult(mockDb, []);

			const event = createMockEvent({ method: 'GET', params: PARAMS, user: testUser });
			const response = await GET(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data).toEqual([]);
		});

		it('should return 404 when plan not found', async () => {
			(mockDb.query as Record<string, { findFirst: ReturnType<typeof vi.fn> }>).testPlan.findFirst.mockResolvedValue(null);

			const event = createMockEvent({ method: 'GET', params: PARAMS, user: testUser });
			const response = await GET(event);

			expect(response.status).toBe(404);
		});

		it('should reject invalid plan ID', async () => {
			const event = createMockEvent({
				method: 'GET',
				params: { projectId: '1', planId: 'abc' },
				user: testUser
			});
			await expect(GET(event)).rejects.toThrow();
		});

		it('should return 401 when unauthenticated', async () => {
			const event = createMockEvent({ method: 'GET', params: PARAMS, user: null });
			await expect(GET(event)).rejects.toThrow();
		});
	});

	describe('POST', () => {
		it('should create an APPROVED signoff', async () => {
			const created = {
				id: 2,
				testPlanId: 1,
				userId: 'user-1',
				decision: 'APPROVED',
				comment: 'All good',
				createdAt: new Date()
			};
			mockInsertReturning(mockDb, [created]);
			// Mock admins query for notifications
			mockDb.select.mockImplementation(() => ({
				from: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) => Promise.resolve([]).then(r)
			}) as never);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { decision: 'APPROVED', comment: 'All good' },
				user: testUser
			});
			const response = await POST(event);
			const data = await response.json();

			expect(response.status).toBe(201);
			expect(data.decision).toBe('APPROVED');
			expect(data.comment).toBe('All good');
		});

		it('should create a REJECTED signoff', async () => {
			const created = {
				id: 3,
				testPlanId: 1,
				userId: 'user-1',
				decision: 'REJECTED',
				comment: 'Needs more tests',
				createdAt: new Date()
			};
			mockInsertReturning(mockDb, [created]);
			mockDb.select.mockImplementation(() => ({
				from: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) => Promise.resolve([]).then(r)
			}) as never);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { decision: 'REJECTED', comment: 'Needs more tests' },
				user: testUser
			});
			const response = await POST(event);
			const data = await response.json();

			expect(response.status).toBe(201);
			expect(data.decision).toBe('REJECTED');
		});

		it('should create signoff without comment', async () => {
			const created = {
				id: 4,
				testPlanId: 1,
				userId: 'user-1',
				decision: 'APPROVED',
				comment: null,
				createdAt: new Date()
			};
			mockInsertReturning(mockDb, [created]);
			mockDb.select.mockImplementation(() => ({
				from: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) => Promise.resolve([]).then(r)
			}) as never);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { decision: 'APPROVED' },
				user: testUser
			});
			const response = await POST(event);

			expect(response.status).toBe(201);
		});

		it('should notify plan creator when different user signs off', async () => {
			const created = {
				id: 5,
				testPlanId: 1,
				userId: 'admin-1',
				decision: 'APPROVED',
				comment: null,
				createdAt: new Date()
			};
			mockInsertReturning(mockDb, [created]);
			mockDb.select.mockImplementation(() => ({
				from: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) => Promise.resolve([]).then(r)
			}) as never);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { decision: 'APPROVED' },
				user: adminUser
			});
			await POST(event);

			expect(mockCreateNotification).toHaveBeenCalledWith(
				expect.objectContaining({
					userId: 'user-1',
					type: 'SIGNOFF_SUBMITTED'
				})
			);
		});

		it('should return 400 for invalid decision', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { decision: 'MAYBE' },
				user: testUser
			});
			const response = await POST(event);

			expect(response.status).toBe(400);
		});

		it('should return 400 when decision is missing', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: {},
				user: testUser
			});
			const response = await POST(event);

			expect(response.status).toBe(400);
		});

		it('should return 404 when plan not found', async () => {
			(mockDb.query as Record<string, { findFirst: ReturnType<typeof vi.fn> }>).testPlan.findFirst.mockResolvedValue(null);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { decision: 'APPROVED' },
				user: testUser
			});
			const response = await POST(event);

			expect(response.status).toBe(404);
		});

		it('should return 403 for insufficient role', async () => {
			vi.mocked(authUtils.requireProjectRole).mockRejectedValue(
				Object.assign(new Error(), { status: 403, body: { message: 'Forbidden' } })
			);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { decision: 'APPROVED' },
				user: testUser
			});
			await expect(POST(event)).rejects.toThrow();
		});

		it('should return 401 when unauthenticated', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { decision: 'APPROVED' },
				user: null
			});
			await expect(POST(event)).rejects.toThrow();
		});
	});
});
