import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockSelectResult } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb, col: mockDb.col, sql: mockDb.sql }));
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
	inArray: vi.fn((a: unknown, b: unknown) => ['inArray', a, b]),
	sql: Object.assign(
		(strings: TemplateStringsArray, ...values: unknown[]) => ({
			as: () => ({ sql: strings, values })
		}),
		{ raw: (s: string) => s }
	)
}));
vi.mock('$lib/server/auth-utils', async () => {
	const actual =
		await vi.importActual<typeof import('$lib/server/auth-utils')>('$lib/server/auth-utils');
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

	it('should reject invalid run ID tokens before querying', async () => {
		for (const runIds of [
			'1,abc,2',
			'1,1.5,2',
			'1,0,2',
			'1,01,2',
			'1,1e3,2',
			'1, 2',
			'1,2 ',
			'1,,2',
			`1,${Number.MAX_SAFE_INTEGER + 1}`
		]) {
			vi.clearAllMocks();
			const event = createMockEvent({
				params: PARAMS,
				user: testUser,
				searchParams: { runIds }
			});

			const response = await GET(event);

			expect(response.status).toBe(400);
			expect((await response.json()).error).toContain('positive integers');
			expect(mockDb.select).not.toHaveBeenCalled();
		}
	});

	it('should return 400 when too many run IDs are provided', async () => {
		const event = createMockEvent({
			params: PARAMS,
			user: testUser,
			searchParams: { runIds: Array.from({ length: 21 }, (_, i) => String(i + 1)).join(',') }
		});

		const response = await GET(event);

		expect(response.status).toBe(400);
		expect((await response.json()).error).toContain('20 runs');
		expect(mockDb.select).not.toHaveBeenCalled();
	});

	it('should deduplicate run IDs before querying', async () => {
		const runsWhere = vi.fn().mockReturnThis();
		let callCount = 0;
		mockDb.select.mockImplementation(() => {
			callCount++;
			const data =
				callCount === 1
					? [
							{ id: 1, name: 'QA Run', environment: 'QA' },
							{ id: 2, name: 'Staging Run', environment: 'STAGING' }
						]
					: [];
			const chain: Record<string, unknown> = {};
			for (const m of ['from', 'orderBy', 'innerJoin', 'leftJoin', 'groupBy']) {
				chain[m] = vi.fn().mockReturnValue(chain);
			}
			chain.where = runsWhere;
			chain.then = (r: (v: unknown) => void) => Promise.resolve(data).then(r);
			return chain;
		});

		const event = createMockEvent({
			params: PARAMS,
			user: testUser,
			searchParams: { runIds: '1,1,2,2' }
		});

		const response = await GET(event);

		expect(response.status).toBe(200);
		expect(runsWhere).toHaveBeenNthCalledWith(1, [
			['project_id', 1],
			['inArray', 'id', [1, 2]]
		]);
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

	it('uses the execution version testCaseId so historical versions are included', async () => {
		let callCount = 0;
		mockDb.select.mockImplementation(() => {
			callCount++;
			const data =
				callCount === 1
					? [
							{ id: 1, name: 'QA Run', environment: 'QA' },
							{ id: 2, name: 'Staging Run', environment: 'STAGING' }
						]
					: [
							{
								runId: 1,
								testCaseVersionId: 100,
								status: 'PASS',
								title: 'Historical Login Test',
								testCaseId: 10
							}
						];
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
		expect(mockDb.select).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({ testCaseId: 'test_case_id' })
		);
		const body = await response.json();
		expect(body.matrix).toEqual([
			{
				testCaseId: 10,
				title: 'Historical Login Test',
				results: { QA: 'PASS' }
			}
		]);
	});
});
