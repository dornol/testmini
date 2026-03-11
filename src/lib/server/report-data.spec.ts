import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockDb } = vi.hoisted(() => {
	// Inline chainable factory (cannot import from mock-db inside vi.hoisted)
	function chainable(terminal?: () => unknown) {
		const resolver = terminal ?? (() => []);
		const chain: Record<string, unknown> = {};
		const methods = [
			'from', 'where', 'orderBy', 'limit', 'offset',
			'innerJoin', 'leftJoin', 'groupBy', 'as', 'set',
			'values', 'returning', 'onConflictDoNothing',
			'onConflictDoUpdate', '$dynamic', 'having'
		];
		for (const m of methods) {
			chain[m] = vi.fn().mockImplementation(() => chain);
		}
		chain.then = (resolve: (v: unknown) => void) => Promise.resolve(resolver()).then(resolve);
		return chain;
	}

	const selectChain = chainable();
	const insertChain = chainable();
	const updateChain = chainable();
	const deleteChain = chainable();

	const mockDb = {
		select: vi.fn().mockReturnValue(selectChain),
		insert: vi.fn().mockReturnValue(insertChain),
		update: vi.fn().mockReturnValue(updateChain),
		delete: vi.fn().mockReturnValue(deleteChain),
		_chains: { select: selectChain, insert: insertChain, update: updateChain, delete: deleteChain }
	};

	return { mockDb };
});

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	testRun: {
		id: 'id',
		projectId: 'project_id',
		environment: 'env',
		status: 'status',
		name: 'name',
		createdAt: 'created_at',
		finishedAt: 'finished_at'
	},
	testExecution: {
		id: 'id',
		testRunId: 'test_run_id',
		testCaseVersionId: 'tcv_id',
		status: 'status',
		executedAt: 'executed_at',
		executedBy: 'executed_by',
		startedAt: 'started_at',
		completedAt: 'completed_at'
	},
	testCaseVersion: { id: 'id', testCaseId: 'tc_id', title: 'title', priority: 'priority' },
	testCase: {
		id: 'id',
		projectId: 'project_id',
		key: 'key',
		latestVersionId: 'latest_version_id',
		createdBy: 'created_by'
	},
	testCaseAssignee: { testCaseId: 'tc_id', userId: 'user_id' },
	testCaseGroup: { id: 'id', projectId: 'project_id', name: 'name' },
	issueLink: { id: 'id', testCaseId: 'test_case_id' },
	user: { id: 'id', name: 'name' }
}));
vi.mock('drizzle-orm', () => {
	const mockSql = Object.assign(
		(strings: TemplateStringsArray, ...values: unknown[]) => ({
			strings,
			values,
			as: () => ({ strings, values })
		}),
		{ raw: (s: string) => s }
	);
	return {
		eq: vi.fn((a, b) => [a, b]),
		and: vi.fn((...args) => args),
		sql: mockSql,
		desc: vi.fn((a) => a),
		count: vi.fn((a) => a),
		isNotNull: vi.fn((a) => a),
		gte: vi.fn((a, b) => [a, b]),
		lte: vi.fn((a, b) => [a, b]),
		max: vi.fn((a) => a)
	};
});

import { parseDateRange, loadReportData, type ReportDateRange } from './report-data';

beforeEach(() => {
	vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// parseDateRange
// ---------------------------------------------------------------------------
describe('parseDateRange', () => {
	it('returns allTime when preset is "all"', () => {
		const result = parseDateRange({ preset: 'all' });
		expect(result).toEqual({ from: null, to: null, allTime: true });
	});

	it('defaults to last 30 days when no params provided', () => {
		const result = parseDateRange({});
		expect(result.allTime).toBe(false);
		expect(result.from).toBeInstanceOf(Date);
		expect(result.to).toBeInstanceOf(Date);

		const now = new Date();
		const expected30DaysAgo = new Date();
		expected30DaysAgo.setDate(expected30DaysAgo.getDate() - 30);
		expected30DaysAgo.setHours(0, 0, 0, 0);

		expect(result.from!.getFullYear()).toBe(expected30DaysAgo.getFullYear());
		expect(result.from!.getMonth()).toBe(expected30DaysAgo.getMonth());
		expect(result.from!.getDate()).toBe(expected30DaysAgo.getDate());

		expect(result.to!.getFullYear()).toBe(now.getFullYear());
		expect(result.to!.getMonth()).toBe(now.getMonth());
		expect(result.to!.getDate()).toBe(now.getDate());
	});

	it('sets from to start of day (00:00:00.000)', () => {
		const result = parseDateRange({});
		expect(result.from!.getHours()).toBe(0);
		expect(result.from!.getMinutes()).toBe(0);
		expect(result.from!.getSeconds()).toBe(0);
		expect(result.from!.getMilliseconds()).toBe(0);
	});

	it('sets to to end of day (23:59:59.999)', () => {
		const result = parseDateRange({});
		expect(result.to!.getHours()).toBe(23);
		expect(result.to!.getMinutes()).toBe(59);
		expect(result.to!.getSeconds()).toBe(59);
		expect(result.to!.getMilliseconds()).toBe(999);
	});

	it('uses custom from and to dates', () => {
		const result = parseDateRange({ from: '2025-01-15', to: '2025-02-15' });
		expect(result.allTime).toBe(false);
		expect(result.from!.getFullYear()).toBe(2025);
		expect(result.from!.getMonth()).toBe(0); // January
		expect(result.from!.getDate()).toBe(15);
		expect(result.to!.getFullYear()).toBe(2025);
		expect(result.to!.getMonth()).toBe(1); // February
		expect(result.to!.getDate()).toBe(15);
	});

	it('defaults to today when only from is provided', () => {
		const result = parseDateRange({ from: '2025-06-01' });
		const now = new Date();
		expect(result.from!.getFullYear()).toBe(2025);
		expect(result.from!.getMonth()).toBe(5); // June
		expect(result.from!.getDate()).toBe(1);
		expect(result.to!.getFullYear()).toBe(now.getFullYear());
		expect(result.to!.getMonth()).toBe(now.getMonth());
		expect(result.to!.getDate()).toBe(now.getDate());
	});

	it('defaults to 30 days ago when only to is provided', () => {
		const result = parseDateRange({ to: '2025-12-31' });
		const expected30DaysAgo = new Date();
		expected30DaysAgo.setDate(expected30DaysAgo.getDate() - 30);
		expected30DaysAgo.setHours(0, 0, 0, 0);

		expect(result.from!.getFullYear()).toBe(expected30DaysAgo.getFullYear());
		expect(result.from!.getMonth()).toBe(expected30DaysAgo.getMonth());
		expect(result.from!.getDate()).toBe(expected30DaysAgo.getDate());
		expect(result.to!.getFullYear()).toBe(2025);
		expect(result.to!.getMonth()).toBe(11); // December
		expect(result.to!.getDate()).toBe(31);
	});

	it('falls back to default when from is an invalid date string', () => {
		const result = parseDateRange({ from: 'not-a-date', to: '2025-06-01' });
		const expected30DaysAgo = new Date();
		expected30DaysAgo.setDate(expected30DaysAgo.getDate() - 30);
		expected30DaysAgo.setHours(0, 0, 0, 0);

		expect(result.from!.getFullYear()).toBe(expected30DaysAgo.getFullYear());
		expect(result.from!.getMonth()).toBe(expected30DaysAgo.getMonth());
		expect(result.from!.getDate()).toBe(expected30DaysAgo.getDate());
	});

	it('falls back to default when to is an invalid date string', () => {
		const result = parseDateRange({ from: '2025-06-01', to: 'invalid' });
		const now = new Date();

		expect(result.to!.getFullYear()).toBe(now.getFullYear());
		expect(result.to!.getMonth()).toBe(now.getMonth());
		expect(result.to!.getDate()).toBe(now.getDate());
	});

	it('uses defaults when from and to are null', () => {
		const result = parseDateRange({ from: null, to: null });
		const now = new Date();
		const expected30DaysAgo = new Date();
		expected30DaysAgo.setDate(expected30DaysAgo.getDate() - 30);

		expect(result.allTime).toBe(false);
		expect(result.from!.getDate()).toBe(expected30DaysAgo.getDate());
		expect(result.to!.getDate()).toBe(now.getDate());
	});

	it('uses defaults when from and to are empty strings', () => {
		const result = parseDateRange({ from: '', to: '' });
		const now = new Date();
		const expected30DaysAgo = new Date();
		expected30DaysAgo.setDate(expected30DaysAgo.getDate() - 30);

		expect(result.allTime).toBe(false);
		expect(result.from!.getDate()).toBe(expected30DaysAgo.getDate());
		expect(result.to!.getDate()).toBe(now.getDate());
	});

	it('preset="all" ignores provided from/to params', () => {
		const result = parseDateRange({ preset: 'all', from: '2025-01-01', to: '2025-12-31' });
		expect(result).toEqual({ from: null, to: null, allTime: true });
	});

	it('normalizes custom from to start of day', () => {
		const result = parseDateRange({ from: '2025-03-10T14:30:00Z' });
		expect(result.from!.getHours()).toBe(0);
		expect(result.from!.getMinutes()).toBe(0);
		expect(result.from!.getSeconds()).toBe(0);
		expect(result.from!.getMilliseconds()).toBe(0);
	});

	it('normalizes custom to to end of day', () => {
		const result = parseDateRange({ to: '2025-03-10T08:00:00Z' });
		expect(result.to!.getHours()).toBe(23);
		expect(result.to!.getMinutes()).toBe(59);
		expect(result.to!.getSeconds()).toBe(59);
		expect(result.to!.getMilliseconds()).toBe(999);
	});

	it('returns allTime false for non-"all" preset values', () => {
		const result = parseDateRange({ preset: 'week' });
		expect(result.allTime).toBe(false);
		expect(result.from).toBeInstanceOf(Date);
		expect(result.to).toBeInstanceOf(Date);
	});
});

// ---------------------------------------------------------------------------
// loadReportData
// ---------------------------------------------------------------------------
describe('loadReportData', () => {
	function setupSelectMock(results?: unknown[][]) {
		let callIndex = 0;
		mockDb.select.mockImplementation(() => {
			const data = results ? results[callIndex] ?? [] : [];
			callIndex++;
			const chain: Record<string, unknown> = {};
			const methods = [
				'from', 'where', 'orderBy', 'limit', 'offset',
				'innerJoin', 'leftJoin', 'groupBy', 'as',
				'having', '$dynamic'
			];
			for (const m of methods) {
				chain[m] = vi.fn().mockReturnValue(chain);
			}
			chain.then = (resolve: (v: unknown) => void) => Promise.resolve(data).then(resolve);
			return chain;
		});
	}

	it('returns all 12 stat objects', async () => {
		setupSelectMock();
		const range: ReportDateRange = { from: null, to: null, allTime: true };
		const result = await loadReportData(1, range);

		expect(result).toHaveProperty('envStats');
		expect(result).toHaveProperty('recentRuns');
		expect(result).toHaveProperty('priorityStats');
		expect(result).toHaveProperty('creatorStats');
		expect(result).toHaveProperty('assigneeStats');
		expect(result).toHaveProperty('dailyResults');
		expect(result).toHaveProperty('executorStats');
		expect(result).toHaveProperty('topFailingCases');
		expect(result).toHaveProperty('flakyTests');
		expect(result).toHaveProperty('staleTests');
		expect(result).toHaveProperty('slowestTests');
		expect(result).toHaveProperty('defectDensity');
	});

	it('calls db.select 12 times (one per parallel query)', async () => {
		setupSelectMock();
		const range: ReportDateRange = { from: null, to: null, allTime: true };
		await loadReportData(1, range);

		expect(mockDb.select).toHaveBeenCalledTimes(12);
	});

	it('reverses recentRuns array in output', async () => {
		const mockRuns = [{ id: 1 }, { id: 2 }, { id: 3 }];
		// recentRuns is the 2nd query (index 1)
		const queryResults: unknown[][] = Array.from({ length: 12 }, () => []);
		queryResults[1] = mockRuns;
		setupSelectMock(queryResults);

		const range: ReportDateRange = { from: null, to: null, allTime: true };
		const result = await loadReportData(1, range);

		expect(result.recentRuns).toEqual([{ id: 3 }, { id: 2 }, { id: 1 }]);
	});

	it('passes projectId to queries', async () => {
		setupSelectMock();
		const { eq } = await import('drizzle-orm');
		const range: ReportDateRange = { from: new Date(), to: new Date(), allTime: false };
		await loadReportData(42, range);

		// eq should have been called with projectId = 42 at least once
		const eqCalls = (eq as ReturnType<typeof vi.fn>).mock.calls;
		const projectIdCalls = eqCalls.filter(
			(call: unknown[]) => call[0] === 'project_id' && call[1] === 42
		);
		expect(projectIdCalls.length).toBeGreaterThan(0);
	});

	it('handles empty results gracefully', async () => {
		setupSelectMock();
		const range: ReportDateRange = { from: new Date(), to: new Date(), allTime: false };
		const result = await loadReportData(1, range);

		expect(result.envStats).toEqual([]);
		expect(result.recentRuns).toEqual([]);
		expect(result.priorityStats).toEqual([]);
		expect(result.creatorStats).toEqual([]);
		expect(result.assigneeStats).toEqual([]);
		expect(result.dailyResults).toEqual([]);
		expect(result.executorStats).toEqual([]);
		expect(result.topFailingCases).toEqual([]);
		expect(result.flakyTests).toEqual([]);
		expect(result.staleTests).toEqual([]);
		expect(result.slowestTests).toEqual([]);
		expect(result.defectDensity).toEqual([]);
	});

	it('works with allTime range (no date conditions)', async () => {
		setupSelectMock();
		const range: ReportDateRange = { from: null, to: null, allTime: true };
		const result = await loadReportData(1, range);

		expect(Object.keys(result)).toHaveLength(12);
	});
});
