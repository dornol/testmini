import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	release: { id: 'id', projectId: 'project_id' },
	testRun: { id: 'id', name: 'name', status: 'status', releaseId: 'release_id' },
	testExecution: { id: 'id', testRunId: 'test_run_id', status: 'status' },
	testCaseVersion: { id: 'id' },
	testCase: { id: 'id' }
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
vi.mock('$lib/server/auth-utils', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/auth-utils')>('$lib/server/auth-utils');
	return {
		...actual,
		requireProjectAccess: vi.fn().mockResolvedValue({ role: 'QA' })
	};
});

const { GET } = await import('./+server');

const PARAMS = { projectId: '1', releaseId: '300' };

const sampleRelease = {
	id: 300,
	projectId: 1,
	name: 'v1.0.0',
	status: 'PLANNING'
};

describe('/api/projects/[projectId]/releases/[releaseId]/readiness', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		(mockDb.query as Record<string, { findFirst: ReturnType<typeof vi.fn> }>).release = {
			findFirst: vi.fn().mockResolvedValue(sampleRelease)
		};
	});

	it('should return GO verdict when all executions pass', async () => {
		mockDb.select.mockImplementation(() => ({
			from: vi.fn().mockReturnThis(),
			where: vi.fn().mockReturnThis(),
			then: (r: (v: unknown) => void) =>
				Promise.resolve([
					{ id: 50, name: 'Run 1', status: 'COMPLETED', total: 10, pass: 10, fail: 0, blocked: 0, pending: 0 }
				]).then(r)
		}) as never);

		const event = createMockEvent({ method: 'GET', params: PARAMS, user: testUser });
		const response = await GET(event);
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.verdict).toBe('GO');
		expect(data.stats.total).toBe(10);
		expect(data.stats.pass).toBe(10);
		expect(data.stats.passRate).toBe(100);
		expect(data.blockingRuns).toEqual([]);
	});

	it('should return NO_GO verdict when there are failures', async () => {
		mockDb.select.mockImplementation(() => ({
			from: vi.fn().mockReturnThis(),
			where: vi.fn().mockReturnThis(),
			then: (r: (v: unknown) => void) =>
				Promise.resolve([
					{ id: 50, name: 'Run 1', status: 'COMPLETED', total: 10, pass: 7, fail: 2, blocked: 1, pending: 0 }
				]).then(r)
		}) as never);

		const event = createMockEvent({ method: 'GET', params: PARAMS, user: testUser });
		const response = await GET(event);
		const data = await response.json();

		expect(data.verdict).toBe('NO_GO');
		expect(data.stats.fail).toBe(2);
		expect(data.stats.blocked).toBe(1);
		expect(data.blockingRuns).toHaveLength(1);
		expect(data.blockingRuns[0].id).toBe(50);
		expect(data.blockingRuns[0].fail).toBe(2);
		expect(data.blockingRuns[0].blocked).toBe(1);
	});

	it('should return NO_GO when there are blocked executions', async () => {
		mockDb.select.mockImplementation(() => ({
			from: vi.fn().mockReturnThis(),
			where: vi.fn().mockReturnThis(),
			then: (r: (v: unknown) => void) =>
				Promise.resolve([
					{ id: 50, name: 'Run 1', status: 'IN_PROGRESS', total: 5, pass: 3, fail: 0, blocked: 2, pending: 0 }
				]).then(r)
		}) as never);

		const event = createMockEvent({ method: 'GET', params: PARAMS, user: testUser });
		const response = await GET(event);
		const data = await response.json();

		expect(data.verdict).toBe('NO_GO');
	});

	it('should return CAUTION when there are pending executions', async () => {
		mockDb.select.mockImplementation(() => ({
			from: vi.fn().mockReturnThis(),
			where: vi.fn().mockReturnThis(),
			then: (r: (v: unknown) => void) =>
				Promise.resolve([
					{ id: 50, name: 'Run 1', status: 'IN_PROGRESS', total: 10, pass: 5, fail: 0, blocked: 0, pending: 5 }
				]).then(r)
		}) as never);

		const event = createMockEvent({ method: 'GET', params: PARAMS, user: testUser });
		const response = await GET(event);
		const data = await response.json();

		expect(data.verdict).toBe('CAUTION');
		expect(data.stats.pending).toBe(5);
	});

	it('should return CAUTION when no runs are linked', async () => {
		mockDb.select.mockImplementation(() => ({
			from: vi.fn().mockReturnThis(),
			where: vi.fn().mockReturnThis(),
			then: (r: (v: unknown) => void) => Promise.resolve([]).then(r)
		}) as never);

		const event = createMockEvent({ method: 'GET', params: PARAMS, user: testUser });
		const response = await GET(event);
		const data = await response.json();

		expect(data.verdict).toBe('CAUTION');
		expect(data.runCount).toBe(0);
		expect(data.stats.total).toBe(0);
		expect(data.stats.passRate).toBe(0);
	});

	it('should aggregate stats across multiple runs', async () => {
		mockDb.select.mockImplementation(() => ({
			from: vi.fn().mockReturnThis(),
			where: vi.fn().mockReturnThis(),
			then: (r: (v: unknown) => void) =>
				Promise.resolve([
					{ id: 50, name: 'Run 1', status: 'COMPLETED', total: 5, pass: 5, fail: 0, blocked: 0, pending: 0 },
					{ id: 51, name: 'Run 2', status: 'COMPLETED', total: 5, pass: 5, fail: 0, blocked: 0, pending: 0 }
				]).then(r)
		}) as never);

		const event = createMockEvent({ method: 'GET', params: PARAMS, user: testUser });
		const response = await GET(event);
		const data = await response.json();

		expect(data.verdict).toBe('GO');
		expect(data.runCount).toBe(2);
		expect(data.stats.total).toBe(10);
		expect(data.stats.pass).toBe(10);
		expect(data.stats.passRate).toBe(100);
	});

	it('should return 404 when release not found', async () => {
		(mockDb.query as Record<string, { findFirst: ReturnType<typeof vi.fn> }>).release.findFirst.mockResolvedValue(null);

		const event = createMockEvent({ method: 'GET', params: PARAMS, user: testUser });
		const response = await GET(event);

		expect(response.status).toBe(404);
	});

	it('should reject invalid release ID', async () => {
		const event = createMockEvent({
			method: 'GET',
			params: { projectId: '1', releaseId: 'abc' },
			user: testUser
		});
		await expect(GET(event)).rejects.toThrow();
	});

	it('should return 401 when unauthenticated', async () => {
		const event = createMockEvent({ method: 'GET', params: PARAMS, user: null });
		await expect(GET(event)).rejects.toThrow();
	});
});
