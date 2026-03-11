import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockSelectResult } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	testRun: { id: 'id', projectId: 'project_id', name: 'name', environment: 'environment', createdBy: 'created_by' },
	testExecution: { id: 'id', testRunId: 'test_run_id', testCaseVersionId: 'test_case_version_id' },
	testCase: { id: 'id', projectId: 'project_id', latestVersionId: 'latest_version_id' }
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	and: vi.fn((...args: unknown[]) => args),
	inArray: vi.fn((a: unknown, b: unknown) => ({ type: 'inArray', field: a, values: b }))
}));

vi.mock('$lib/server/auth-utils', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/auth-utils')>('$lib/server/auth-utils');
	return {
		...actual,
		requireProjectRole: vi.fn().mockResolvedValue({ role: 'QA' })
	};
});

const { POST } = await import('./+server');

describe('/api/projects/[projectId]/test-runs/cross-env', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should create runs for each environment', async () => {
		// Mock select for test cases
		mockSelectResult(mockDb, [
			{ id: 1, latestVersionId: 100 },
			{ id: 2, latestVersionId: 200 }
		]);

		// Mock transaction
		const createdRuns: { id: number }[] = [];
		let runCounter = 1;
		mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
			const tx = {
				insert: vi.fn().mockReturnValue({
					values: vi.fn().mockReturnValue({
						returning: vi.fn().mockImplementation(() => ({
							then: (r: (v: unknown) => void) => {
								const run = { id: runCounter++ };
								createdRuns.push(run);
								return Promise.resolve([run]).then(r);
							}
						}))
					})
				})
			};
			return fn(tx);
		});

		const event = createMockEvent({
			method: 'POST',
			params: { projectId: '1' },
			body: {
				name: 'Regression',
				testCaseIds: [1, 2],
				environments: ['QA', 'STAGE']
			},
			user: testUser
		});
		const response = await POST(event);
		const data = await response.json();

		expect(response.status).toBe(201);
		expect(data.runs).toHaveLength(2);
	});

	it('should return 400 for fewer than 2 environments', async () => {
		const event = createMockEvent({
			method: 'POST',
			params: { projectId: '1' },
			body: {
				name: 'Regression',
				testCaseIds: [1],
				environments: ['QA']
			},
			user: testUser
		});
		const response = await POST(event);
		expect(response.status).toBe(400);
	});

	it('should return 400 for empty testCaseIds', async () => {
		const event = createMockEvent({
			method: 'POST',
			params: { projectId: '1' },
			body: {
				name: 'Regression',
				testCaseIds: [],
				environments: ['QA', 'STAGE']
			},
			user: testUser
		});
		const response = await POST(event);
		expect(response.status).toBe(400);
	});

	it('should return 400 when no valid test cases found', async () => {
		mockSelectResult(mockDb, []);

		const event = createMockEvent({
			method: 'POST',
			params: { projectId: '1' },
			body: {
				name: 'Regression',
				testCaseIds: [999],
				environments: ['QA', 'STAGE']
			},
			user: testUser
		});
		const response = await POST(event);
		expect(response.status).toBe(400);
	});

	it('should return 401 for unauthenticated', async () => {
		const event = createMockEvent({
			method: 'POST',
			params: { projectId: '1' },
			body: {
				name: 'Regression',
				testCaseIds: [1],
				environments: ['QA', 'STAGE']
			},
			user: null
		});
		await expect(POST(event)).rejects.toThrow();
	});
});
