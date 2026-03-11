import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	testPlan: { id: 'id', name: 'name', status: 'status', projectId: 'project_id', createdBy: 'created_by' },
	testPlanTestCase: { id: 'id', testPlanId: 'test_plan_id', testCaseId: 'test_case_id', position: 'position' },
	testCase: { id: 'id', key: 'key', latestVersionId: 'latest_version_id', projectId: 'project_id' },
	testCaseVersion: { id: 'id', testCaseId: 'test_case_id', title: 'title', priority: 'priority' },
	testRun: { id: 'id', name: 'name', status: 'status', environment: 'environment', testPlanId: 'test_plan_id', createdAt: 'created_at' },
	user: { id: 'id', name: 'name' },
	testPlanSignoff: { id: 'id', testPlanId: 'test_plan_id', userId: 'user_id', decision: 'decision', comment: 'comment', createdAt: 'created_at' },
	project: { id: 'id', requireSignoff: 'require_signoff' },
	release: { id: 'id', name: 'name', version: 'version', projectId: 'project_id' }
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
vi.mock('$lib/server/auth-utils', () => ({
	requireAuth: vi.fn().mockReturnValue(testUser),
	requireProjectRole: vi.fn().mockResolvedValue({ role: 'QA' })
}));

const { load } = await import('./+page.server');

const PARAMS = { projectId: '1', planId: '10' };

const samplePlan = {
	id: 10, projectId: 1, name: 'Sprint Plan',
	status: 'ACTIVE', createdBy: 'user-1', createdAt: new Date()
};

function createLoadEvent(params = PARAMS) {
	const event = createMockEvent({ params });
	(event as Record<string, unknown>).parent = vi.fn().mockResolvedValue({});
	return event;
}

function setupSelectMock(overrides: Record<number, unknown[]> = {}) {
	let selectCall = 0;
	mockDb.select.mockImplementation(() => {
		selectCall++;
		const chain: Record<string, unknown> = {};
		for (const m of ['from', 'where', 'orderBy', 'innerJoin', 'leftJoin']) {
			chain[m] = vi.fn().mockReturnValue(chain);
		}
		const defaults: Record<number, unknown[]> = {
			1: [{ name: 'Creator' }],       // creator
			2: [],                            // items
			3: [],                            // runs
			4: [],                            // allTestCases
			5: [],                            // signoffs
			6: [{ requireSignoff: false }],   // project settings
			7: []                             // releases
		};
		const data = overrides[selectCall] ?? defaults[selectCall] ?? [];
		chain.then = (resolve: (v: unknown) => void) => Promise.resolve(data).then(resolve);
		return chain;
	});
}

describe('test-plans/[planId] page server', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		(mockDb.query as Record<string, { findFirst: ReturnType<typeof vi.fn> }>).testPlan = {
			findFirst: vi.fn().mockResolvedValue(samplePlan)
		};
	});

	it('should return 404 when plan not found', async () => {
		(mockDb.query as Record<string, { findFirst: ReturnType<typeof vi.fn> }>).testPlan.findFirst.mockResolvedValue(null);
		await expect(load(createLoadEvent() as never)).rejects.toThrow();
	});

	it('should return plan with creator name', async () => {
		setupSelectMock();
		const result = await load(createLoadEvent() as never) as Record<string, any>;

		expect(result.plan.id).toBe(10);
		expect(result.plan.name).toBe('Sprint Plan');
		expect(result.plan.createdByName).toBe('Creator');
	});

	it('should return empty creator name when creator not found', async () => {
		setupSelectMock({ 1: [undefined] });
		const result = await load(createLoadEvent() as never) as Record<string, any>;

		expect(result.plan.createdByName).toBe('');
	});

	it('should return items, runs, allTestCases, signoffs, and releases', async () => {
		setupSelectMock({
			2: [{ id: 1, testCaseId: 5, key: 'TC-001', title: 'Test', priority: 'HIGH', position: 0 }],
			3: [{ id: 50, name: 'Run 1', status: 'COMPLETED', environment: 'QA', createdAt: new Date() }],
			4: [{ id: 5, key: 'TC-001', title: 'Test', priority: 'HIGH' }],
			5: [{ id: 1, decision: 'APPROVED', comment: 'LGTM', createdAt: new Date(), userName: 'Admin' }],
			7: [{ id: 100, name: 'v1.0', version: '1.0.0' }]
		});
		const result = await load(createLoadEvent() as never) as Record<string, any>;

		expect(result.items).toHaveLength(1);
		expect(result.runs).toHaveLength(1);
		expect(result.allTestCases).toHaveLength(1);
		expect(result.signoffs).toHaveLength(1);
		expect(result.releases).toHaveLength(1);
	});

	it('should return requireSignoff from project settings', async () => {
		setupSelectMock({ 6: [{ requireSignoff: true }] });
		const result = await load(createLoadEvent() as never) as Record<string, any>;

		expect(result.requireSignoff).toBe(true);
	});

	it('should default requireSignoff to false when project not found', async () => {
		setupSelectMock({ 6: [undefined] });
		const result = await load(createLoadEvent() as never) as Record<string, any>;

		expect(result.requireSignoff).toBe(false);
	});

	it('should call db.select 7 times (parallelized queries)', async () => {
		setupSelectMock();
		await load(createLoadEvent() as never);

		expect(mockDb.select).toHaveBeenCalledTimes(7);
	});
});
