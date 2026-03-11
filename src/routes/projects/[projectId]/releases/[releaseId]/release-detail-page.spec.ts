import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	release: {
		id: 'id', name: 'name', version: 'version', description: 'description',
		status: 'status', projectId: 'project_id', createdBy: 'created_by', createdAt: 'created_at'
	},
	testPlan: { id: 'id', name: 'name', status: 'status', milestone: 'milestone', releaseId: 'release_id', projectId: 'project_id' },
	testRun: { id: 'id', name: 'name', status: 'status', environment: 'environment', releaseId: 'release_id', projectId: 'project_id', createdAt: 'created_at' },
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
vi.mock('$lib/server/auth-utils', () => ({
	requireAuth: vi.fn().mockReturnValue(testUser),
	requireProjectRole: vi.fn().mockResolvedValue({ role: 'QA' })
}));

const { load } = await import('./+page.server');

const PARAMS = { projectId: '1', releaseId: '300' };

const sampleRelease = {
	id: 300, projectId: 1, name: 'v1.0', version: '1.0.0',
	status: 'PLANNING', createdBy: 'user-1', createdAt: new Date()
};

function createLoadEvent(params = PARAMS) {
	const event = createMockEvent({ params });
	(event as Record<string, unknown>).parent = vi.fn().mockResolvedValue({});
	return event;
}

function setupSelectMock(runs: unknown[] = []) {
	let selectCall = 0;
	mockDb.select.mockImplementation(() => {
		selectCall++;
		const chain: Record<string, unknown> = {};
		const methods = ['from', 'where', 'orderBy', 'innerJoin', 'leftJoin'];
		for (const m of methods) {
			chain[m] = vi.fn().mockReturnValue(chain);
		}

		let data: unknown[];
		if (selectCall === 1) data = [{ name: 'Creator' }]; // creator
		else if (selectCall === 2) data = []; // plans
		else if (selectCall === 3) data = runs; // runs with stats
		else if (selectCall === 4) data = []; // availablePlans
		else data = []; // availableRuns

		chain.then = (resolve: (v: unknown) => void) => Promise.resolve(data).then(resolve);
		return chain;
	});
}

describe('releases/[releaseId] page server', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		(mockDb.query as Record<string, { findFirst: ReturnType<typeof vi.fn> }>).release = {
			findFirst: vi.fn().mockResolvedValue(sampleRelease)
		};
	});

	it('should return 404 when release not found', async () => {
		(mockDb.query as Record<string, { findFirst: ReturnType<typeof vi.fn> }>).release.findFirst.mockResolvedValue(null);
		await expect(load(createLoadEvent() as never)).rejects.toThrow();
	});

	it('should return release with creator name', async () => {
		setupSelectMock();
		const result = await load(createLoadEvent() as never) as Record<string, any>;

		expect(result.release.id).toBe(300);
		expect(result.release.createdByName).toBe('Creator');
	});

	it('should compute GO verdict when all tests pass', async () => {
		setupSelectMock([
			{ id: 50, name: 'Run 1', status: 'COMPLETED', environment: 'QA', createdAt: new Date(), total: 10, pass: 10, fail: 0, blocked: 0, pending: 0 }
		]);
		const result = await load(createLoadEvent() as never) as Record<string, any>;

		expect(result.verdict).toBe('GO');
		expect(result.stats.passRate).toBe(100);
	});

	it('should compute NO_GO verdict when failures exist', async () => {
		setupSelectMock([
			{ id: 50, name: 'Run 1', status: 'COMPLETED', environment: 'QA', createdAt: new Date(), total: 10, pass: 7, fail: 2, blocked: 1, pending: 0 }
		]);
		const result = await load(createLoadEvent() as never) as Record<string, any>;

		expect(result.verdict).toBe('NO_GO');
		expect(result.stats.fail).toBe(2);
		expect(result.stats.blocked).toBe(1);
	});

	it('should compute NO_GO verdict when blocked tests exist (no failures)', async () => {
		setupSelectMock([
			{ id: 50, name: 'Run 1', status: 'IN_PROGRESS', environment: 'QA', createdAt: new Date(), total: 5, pass: 4, fail: 0, blocked: 1, pending: 0 }
		]);
		const result = await load(createLoadEvent() as never) as Record<string, any>;

		expect(result.verdict).toBe('NO_GO');
	});

	it('should compute CAUTION verdict when pending tests exist', async () => {
		setupSelectMock([
			{ id: 50, name: 'Run 1', status: 'IN_PROGRESS', environment: 'QA', createdAt: new Date(), total: 10, pass: 8, fail: 0, blocked: 0, pending: 2 }
		]);
		const result = await load(createLoadEvent() as never) as Record<string, any>;

		expect(result.verdict).toBe('CAUTION');
		expect(result.stats.pending).toBe(2);
	});

	it('should compute CAUTION verdict when no runs exist', async () => {
		setupSelectMock([]);
		const result = await load(createLoadEvent() as never) as Record<string, any>;

		expect(result.verdict).toBe('CAUTION');
		expect(result.stats.total).toBe(0);
		expect(result.stats.passRate).toBe(0);
	});

	it('should aggregate stats across multiple runs', async () => {
		setupSelectMock([
			{ id: 50, name: 'Run 1', status: 'COMPLETED', environment: 'QA', createdAt: new Date(), total: 10, pass: 8, fail: 1, blocked: 1, pending: 0 },
			{ id: 51, name: 'Run 2', status: 'COMPLETED', environment: 'Staging', createdAt: new Date(), total: 5, pass: 5, fail: 0, blocked: 0, pending: 0 }
		]);
		const result = await load(createLoadEvent() as never) as Record<string, any>;

		expect(result.stats.total).toBe(15);
		expect(result.stats.pass).toBe(13);
		expect(result.stats.fail).toBe(1);
		expect(result.stats.blocked).toBe(1);
		expect(result.stats.passRate).toBe(87); // Math.round(13/15*100)
		expect(result.verdict).toBe('NO_GO'); // fail > 0
	});

	it('should return empty creator name when creator not found', async () => {
		let selectCall = 0;
		mockDb.select.mockImplementation(() => {
			selectCall++;
			const chain: Record<string, unknown> = {};
			for (const m of ['from', 'where', 'orderBy', 'innerJoin', 'leftJoin']) {
				chain[m] = vi.fn().mockReturnValue(chain);
			}
			const data = selectCall === 1 ? [undefined] : [];
			chain.then = (resolve: (v: unknown) => void) => Promise.resolve(data).then(resolve);
			return chain;
		});

		const result = await load(createLoadEvent() as never) as Record<string, any>;
		expect(result.release.createdByName).toBe('');
	});

	it('should call db.select 5 times (parallelized queries)', async () => {
		setupSelectMock();
		await load(createLoadEvent() as never);

		expect(mockDb.select).toHaveBeenCalledTimes(5);
	});
});
