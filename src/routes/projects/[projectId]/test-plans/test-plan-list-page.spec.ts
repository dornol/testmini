import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	testPlan: { id: 'id', name: 'name', description: 'description', status: 'status', milestone: 'milestone', startDate: 'start_date', endDate: 'end_date', createdBy: 'created_by', createdAt: 'created_at', projectId: 'project_id' },
	user: { id: 'id', name: 'name' }
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	sql: Object.assign(
		(strings: TemplateStringsArray, ...values: unknown[]) => ({
			as: () => ({ sql: strings, values })
		}),
		{ raw: (s: string) => s }
	)
}));
vi.mock('$lib/server/auth-utils', () => ({
	requireAuth: vi.fn(),
	requireProjectRole: vi.fn().mockResolvedValue({ role: 'QA' })
}));

const { load } = await import('./+page.server');

function createLoadEvent() {
	const event = createMockEvent({ params: { projectId: '1' } });
	(event as Record<string, unknown>).parent = vi.fn().mockResolvedValue({});
	return event;
}

function setupSelectMock(plans: unknown[] = []) {
	const chain: Record<string, unknown> = {};
	for (const m of ['from', 'where', 'orderBy', 'innerJoin']) {
		chain[m] = vi.fn().mockReturnValue(chain);
	}
	chain.then = (resolve: (v: unknown) => void) => Promise.resolve(plans).then(resolve);
	mockDb.select.mockReturnValue(chain as never);
}

describe('test-plans list page server', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should return plans list', async () => {
		setupSelectMock([
			{ id: 1, name: 'Plan 1', status: 'ACTIVE', createdBy: 'User', itemCount: 5, runCount: 2 },
			{ id: 2, name: 'Plan 2', status: 'DRAFT', createdBy: 'User', itemCount: 0, runCount: 0 }
		]);
		const result = await load(createLoadEvent() as never) as Record<string, any>;

		expect(result.plans).toHaveLength(2);
		expect(result.plans[0].name).toBe('Plan 1');
		expect(result.plans[1].status).toBe('DRAFT');
	});

	it('should return empty plans when none exist', async () => {
		setupSelectMock([]);
		const result = await load(createLoadEvent() as never) as Record<string, any>;

		expect(result.plans).toEqual([]);
	});

	it('should include itemCount and runCount from subqueries', async () => {
		setupSelectMock([
			{ id: 1, name: 'Plan', status: 'ACTIVE', createdBy: 'User', itemCount: 10, runCount: 3 }
		]);
		const result = await load(createLoadEvent() as never) as Record<string, any>;

		expect(result.plans[0].itemCount).toBe(10);
		expect(result.plans[0].runCount).toBe(3);
	});
});
