import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb, col: mockDb.col, sql: mockDb.sql }));
vi.mock('$lib/server/db/schema', () => ({
	testRun: {
		id: 'id',
		projectId: 'project_id',
		name: 'name',
		environment: 'environment',
		status: 'status'
	},
	testExecution: {
		testRunId: 'test_run_id',
		testCaseVersionId: 'test_case_version_id',
		status: 'status'
	},
	testCaseVersion: {
		id: 'id',
		testCaseId: 'test_case_id',
		title: 'title',
		priority: 'priority'
	},
	testCase: {
		id: 'id',
		key: 'key'
	}
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	and: vi.fn((...args: unknown[]) => args)
}));
vi.mock('$lib/server/auth-utils', () => ({
	parseId: vi.fn((raw: string) => Number(raw))
}));

const { load } = await import('./+page.server');

function createLoadEvent(searchParams: Record<string, string>) {
	const event = createMockEvent({
		params: { projectId: '1' },
		searchParams
	});
	(event as Record<string, unknown>).parent = vi.fn().mockResolvedValue({});
	return event;
}

describe('/projects/[projectId]/test-runs/compare', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it.each([
		{ runA: '', runB: '2' },
		{ runA: '0', runB: '2' },
		{ runA: '-1', runB: '2' },
		{ runA: '+1', runB: '2' },
		{ runA: '01', runB: '2' },
		{ runA: '1.5', runB: '2' },
		{ runA: '1e3', runB: '2' },
		{ runA: ' 1', runB: '2' },
		{ runA: '1 ', runB: '2' },
		{ runA: 'Infinity', runB: '2' },
		{ runA: '9007199254740992', runB: '2' },
		{ runA: '2', runB: '2' }
	])('should reject invalid run IDs %o before querying runs', async (searchParams) => {
		await expect(load(createLoadEvent(searchParams))).rejects.toMatchObject({ status: 400 });
		expect(mockDb.query.testRun.findFirst).not.toHaveBeenCalled();
		expect(mockDb.select).not.toHaveBeenCalled();
	});
});
