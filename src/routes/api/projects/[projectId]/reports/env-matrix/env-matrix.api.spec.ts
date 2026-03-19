import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockSelectResult } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	testRun: {
		id: 'id',
		projectId: 'project_id',
		name: 'name',
		environment: 'environment'
	},
	testExecution: {
		id: 'id',
		testRunId: 'test_run_id',
		testCaseVersionId: 'test_case_version_id',
		status: 'status'
	},
	testCaseVersion: {
		id: 'id',
		title: 'title',
		testCaseId: 'test_case_id'
	}
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	and: vi.fn((...args: unknown[]) => args),
	inArray: vi.fn((a: unknown, b: unknown) => [a, b]),
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
		requireProjectRole: vi.fn().mockResolvedValue({ role: 'QA' })
	};
});

const { GET } = await import('./+server');

const PARAMS = { projectId: '1' };

describe('/api/projects/[projectId]/reports/env-matrix', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should return 401 when not authenticated', async () => {
		const event = createMockEvent({ params: PARAMS, user: null });
		await expect(GET(event)).rejects.toThrow();
	});

	it('should return 400 when runIds param is missing', async () => {
		const event = createMockEvent({ params: PARAMS, user: testUser });
		const response = await GET(event);
		expect(response.status).toBe(400);
	});

	it('should return 400 when fewer than 2 run IDs provided', async () => {
		const event = createMockEvent({
			params: PARAMS,
			user: testUser,
			searchParams: { runIds: '1' }
		});
		const response = await GET(event);
		expect(response.status).toBe(400);
	});

	it('should return 400 when fewer than 2 valid runs found', async () => {
		// First select returns only 1 matching run
		mockSelectResult(mockDb, [{ id: 1, name: 'Run 1', environment: 'QA' }]);

		const event = createMockEvent({
			params: PARAMS,
			user: testUser,
			searchParams: { runIds: '1,2' }
		});
		const response = await GET(event);
		expect(response.status).toBe(400);
	});

	it('should return env matrix data on success', async () => {
		let callCount = 0;
		mockDb.select.mockImplementation(() => {
			callCount++;
			let data: unknown[];
			if (callCount === 1) {
				// runs query
				data = [
					{ id: 1, name: 'QA Run', environment: 'QA' },
					{ id: 2, name: 'Staging Run', environment: 'STAGING' }
				];
			} else {
				// executions query
				data = [
					{ runId: 1, testCaseVersionId: 100, status: 'PASS', title: 'Login Test', testCaseId: 10 },
					{ runId: 2, testCaseVersionId: 100, status: 'FAIL', title: 'Login Test', testCaseId: 10 }
				];
			}
			const chain: Record<string, unknown> = {};
			for (const m of ['from', 'where', 'orderBy', 'innerJoin', 'leftJoin', 'groupBy']) {
				chain[m] = vi.fn().mockReturnValue(chain);
			}
			chain.then = (r: (v: unknown) => void) => Promise.resolve(data).then(r);
			return chain;
		});

		const event = createMockEvent({
			params: PARAMS,
			user: testUser,
			searchParams: { runIds: '1,2' }
		});
		const response = await GET(event);
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.environments).toBeDefined();
		expect(body.runs).toHaveLength(2);
		expect(body.matrix).toBeDefined();
		expect(body.envStats).toBeDefined();
		expect(body.envSpecificFailures).toBeDefined();
	});
});
