import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	testRun: {
		id: 'id', name: 'name', environment: 'environment', status: 'status',
		createdBy: 'created_by', createdAt: 'created_at', startedAt: 'started_at',
		finishedAt: 'finished_at', retestOfRunId: 'retest_of_run_id', projectId: 'project_id'
	},
	testExecution: { id: 'id', testRunId: 'test_run_id', status: 'status' },
	user: { id: 'id', name: 'name' }
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	and: vi.fn((...args: unknown[]) => args),
	count: vi.fn(() => 'count'),
	desc: vi.fn((a: unknown) => a),
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

function createLoadEvent(searchParams: Record<string, string> = {}) {
	const event = createMockEvent({ params: { projectId: '1' }, searchParams });
	(event as Record<string, unknown>).parent = vi.fn().mockResolvedValue({});
	return event;
}

function setupSelectMock(runs: unknown[] = [], total = 0) {
	let selectCall = 0;
	mockDb.select.mockImplementation(() => {
		selectCall++;
		const chain: Record<string, unknown> = {};
		for (const m of ['from', 'where', 'orderBy', 'limit', 'offset', 'innerJoin']) {
			chain[m] = vi.fn().mockReturnValue(chain);
		}
		const data = selectCall === 1 ? runs : [{ total }];
		chain.then = (resolve: (v: unknown) => void) => Promise.resolve(data).then(resolve);
		return chain;
	});
}

describe('test-runs list page server', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should return runs with pagination meta', async () => {
		setupSelectMock(
			[{ id: 50, name: 'Run 1', status: 'COMPLETED', totalCount: 10, passedCount: 8 }],
			1
		);
		const result = await load(createLoadEvent() as never) as Record<string, any>;

		expect(result.runs).toHaveLength(1);
		expect(result.meta.page).toBe(1);
		expect(result.meta.limit).toBe(20);
		expect(result.meta.total).toBe(1);
		expect(result.meta.totalPages).toBe(1);
	});

	it('should return empty runs', async () => {
		setupSelectMock([], 0);
		const result = await load(createLoadEvent() as never) as Record<string, any>;

		expect(result.runs).toEqual([]);
		expect(result.meta.total).toBe(0);
		expect(result.meta.totalPages).toBe(0);
	});

	it('should apply status filter', async () => {
		setupSelectMock([], 0);
		const result = await load(createLoadEvent({ status: 'COMPLETED' }) as never) as Record<string, any>;

		expect(result.statusFilter).toBe('COMPLETED');
	});

	it('should ignore invalid status filter', async () => {
		setupSelectMock([], 0);
		const result = await load(createLoadEvent({ status: 'INVALID' }) as never) as Record<string, any>;

		expect(result.statusFilter).toBe('INVALID');
		// Invalid status is stored but not applied as filter condition
	});

	it('should handle custom page and limit', async () => {
		setupSelectMock([], 100);
		const result = await load(createLoadEvent({ page: '3', limit: '10' }) as never) as Record<string, any>;

		expect(result.meta.page).toBe(3);
		expect(result.meta.limit).toBe(10);
		expect(result.meta.totalPages).toBe(10); // 100/10
	});

	it('should clamp limit to valid range (1-50)', async () => {
		setupSelectMock([], 0);
		const result = await load(createLoadEvent({ limit: '200' }) as never) as Record<string, any>;

		expect(result.meta.limit).toBe(50);
	});

	it('should clamp page to minimum 1', async () => {
		setupSelectMock([], 0);
		const result = await load(createLoadEvent({ page: '-5' }) as never) as Record<string, any>;

		expect(result.meta.page).toBe(1);
	});

	it('should compute totalPages correctly', async () => {
		setupSelectMock([], 45);
		const result = await load(createLoadEvent({ limit: '20' }) as never) as Record<string, any>;

		expect(result.meta.totalPages).toBe(3); // ceil(45/20)
	});
});
