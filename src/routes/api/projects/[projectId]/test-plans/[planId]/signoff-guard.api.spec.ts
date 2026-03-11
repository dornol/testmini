/**
 * Tests for the sign-off completion guard in test plan PATCH.
 * When project.requireSignoff is true, completing a plan requires an APPROVED signoff.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

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
		createdAt: 'created_at',
		releaseId: 'release_id'
	},
	testPlanTestCase: { id: 'id', testPlanId: 'test_plan_id' },
	testCase: { id: 'id', key: 'key', latestVersionId: 'latest_version_id' },
	testCaseVersion: { id: 'id', title: 'title', priority: 'priority' },
	testRun: { id: 'id', name: 'name', status: 'status', environment: 'environment', testPlanId: 'test_plan_id', createdAt: 'created_at' },
	user: { id: 'id', name: 'name' },
	project: { id: 'id', requireSignoff: 'require_signoff' },
	testPlanSignoff: { id: 'id', testPlanId: 'test_plan_id', decision: 'decision', createdAt: 'created_at' }
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	and: vi.fn((...args: unknown[]) => args),
	desc: vi.fn((a: unknown) => a),
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

const { PATCH } = await import('./+server');
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

describe('Test Plan PATCH - Sign-off Guard', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(authUtils.requireProjectRole).mockResolvedValue({ role: 'PROJECT_ADMIN' });
		(mockDb.query as Record<string, { findFirst: ReturnType<typeof vi.fn> }>).testPlan = {
			findFirst: vi.fn().mockResolvedValue(samplePlan)
		};
	});

	it('should block COMPLETED status when requireSignoff is true and no signoff exists', async () => {
		let selectCall = 0;
		mockDb.select.mockImplementation(() => {
			selectCall++;
			if (selectCall === 1) {
				// project.requireSignoff query
				return {
					from: vi.fn().mockReturnThis(),
					where: vi.fn().mockReturnThis(),
					then: (r: (v: unknown) => void) => Promise.resolve([{ requireSignoff: true }]).then(r)
				} as never;
			}
			// signoff query - no signoffs
			return {
				from: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				orderBy: vi.fn().mockReturnThis(),
				limit: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) => Promise.resolve([]).then(r)
			} as never;
		});

		const event = createMockEvent({
			method: 'PATCH',
			params: PARAMS,
			body: { status: 'COMPLETED' },
			user: testUser
		});
		const response = await PATCH(event);

		expect(response.status).toBe(400);
		const data = await response.json();
		expect(data.error).toContain('Sign-off approval is required');
	});

	it('should block COMPLETED status when latest signoff is REJECTED', async () => {
		let selectCall = 0;
		mockDb.select.mockImplementation(() => {
			selectCall++;
			if (selectCall === 1) {
				return {
					from: vi.fn().mockReturnThis(),
					where: vi.fn().mockReturnThis(),
					then: (r: (v: unknown) => void) => Promise.resolve([{ requireSignoff: true }]).then(r)
				} as never;
			}
			return {
				from: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				orderBy: vi.fn().mockReturnThis(),
				limit: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) => Promise.resolve([{ decision: 'REJECTED' }]).then(r)
			} as never;
		});

		const event = createMockEvent({
			method: 'PATCH',
			params: PARAMS,
			body: { status: 'COMPLETED' },
			user: testUser
		});
		const response = await PATCH(event);

		expect(response.status).toBe(400);
		const data = await response.json();
		expect(data.error).toContain('Sign-off approval is required');
	});

	it('should allow COMPLETED when latest signoff is APPROVED', async () => {
		const completedPlan = { ...samplePlan, status: 'COMPLETED' };
		(mockDb.query as Record<string, { findFirst: ReturnType<typeof vi.fn> }>).testPlan.findFirst
			.mockResolvedValueOnce(samplePlan)
			.mockResolvedValueOnce(completedPlan);

		let selectCall = 0;
		mockDb.select.mockImplementation(() => {
			selectCall++;
			if (selectCall === 1) {
				return {
					from: vi.fn().mockReturnThis(),
					where: vi.fn().mockReturnThis(),
					then: (r: (v: unknown) => void) => Promise.resolve([{ requireSignoff: true }]).then(r)
				} as never;
			}
			return {
				from: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				orderBy: vi.fn().mockReturnThis(),
				limit: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) => Promise.resolve([{ decision: 'APPROVED' }]).then(r)
			} as never;
		});

		const updateChain = {
			set: vi.fn().mockReturnThis(),
			where: vi.fn().mockReturnThis(),
			then: (r: (v: unknown) => void) => Promise.resolve(undefined).then(r)
		};
		mockDb.update.mockReturnValue(updateChain as never);

		const event = createMockEvent({
			method: 'PATCH',
			params: PARAMS,
			body: { status: 'COMPLETED' },
			user: testUser
		});
		const response = await PATCH(event);
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.status).toBe('COMPLETED');
	});

	it('should skip signoff check when requireSignoff is false', async () => {
		const completedPlan = { ...samplePlan, status: 'COMPLETED' };
		(mockDb.query as Record<string, { findFirst: ReturnType<typeof vi.fn> }>).testPlan.findFirst
			.mockResolvedValueOnce(samplePlan)
			.mockResolvedValueOnce(completedPlan);

		mockDb.select.mockImplementation(() => ({
			from: vi.fn().mockReturnThis(),
			where: vi.fn().mockReturnThis(),
			then: (r: (v: unknown) => void) => Promise.resolve([{ requireSignoff: false }]).then(r)
		}) as never);

		const updateChain = {
			set: vi.fn().mockReturnThis(),
			where: vi.fn().mockReturnThis(),
			then: (r: (v: unknown) => void) => Promise.resolve(undefined).then(r)
		};
		mockDb.update.mockReturnValue(updateChain as never);

		const event = createMockEvent({
			method: 'PATCH',
			params: PARAMS,
			body: { status: 'COMPLETED' },
			user: testUser
		});
		const response = await PATCH(event);

		expect(response.status).toBe(200);
	});

	it('should not check signoff when status is not COMPLETED', async () => {
		const activePlan = { ...samplePlan, status: 'ACTIVE' };
		(mockDb.query as Record<string, { findFirst: ReturnType<typeof vi.fn> }>).testPlan.findFirst
			.mockResolvedValueOnce(samplePlan)
			.mockResolvedValueOnce(activePlan);

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

		expect(response.status).toBe(200);
		// project query should not have been called
		expect(mockDb.select).not.toHaveBeenCalled();
	});

	it('should allow setting releaseId on a plan', async () => {
		const updatedPlan = { ...samplePlan, releaseId: 300 };
		(mockDb.query as Record<string, { findFirst: ReturnType<typeof vi.fn> }>).testPlan.findFirst
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
			body: { releaseId: 300 },
			user: testUser
		});
		const response = await PATCH(event);
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.releaseId).toBe(300);
	});
});
