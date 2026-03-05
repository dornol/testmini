import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockSelectResult } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser, adminUser, sampleTestRun, sampleExecution } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	testFailureDetail: {
		id: 'id',
		testExecutionId: 'test_execution_id',
		errorMessage: 'error_message',
		testMethod: 'test_method',
		failureEnvironment: 'failure_environment',
		stackTrace: 'stack_trace',
		comment: 'comment',
		createdBy: 'created_by',
		createdAt: 'created_at'
	},
	testExecution: { id: 'id', testRunId: 'test_run_id', status: 'status', executedBy: 'executed_by', executedAt: 'executed_at' },
	testRun: { id: 'id', projectId: 'project_id' },
	user: { id: 'id', name: 'name' }
}));
vi.mock('$lib/server/db/auth.schema', () => ({
	user: { id: 'id', name: 'name' }
}));
vi.mock('drizzle-orm', () => ({
	and: vi.fn((...args: unknown[]) => args),
	eq: vi.fn((a: unknown, b: unknown) => [a, b])
}));
vi.mock('$lib/server/auth-utils', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/auth-utils')>('$lib/server/auth-utils');
	return {
		...actual,
		requireProjectRole: vi.fn().mockResolvedValue({ role: 'PROJECT_ADMIN' })
	};
});
vi.mock('$lib/schemas/failure.schema', async () => {
	const actual = await vi.importActual<typeof import('$lib/schemas/failure.schema')>('$lib/schemas/failure.schema');
	return actual;
});

const { GET, POST } = await import('./+server');
const authUtils = await import('$lib/server/auth-utils');

const PARAMS = { projectId: '1', runId: '50', executionId: '200' };

const sampleFailure = {
	id: 1,
	testExecutionId: 200,
	errorMessage: 'NullPointerException',
	testMethod: 'testLogin()',
	failureEnvironment: 'QA',
	stackTrace: 'java.lang.NullPointerException\n\tat com.example.Test.testLogin(Test.java:42)',
	comment: 'Needs investigation',
	createdBy: testUser.id,
	createdAt: new Date('2025-01-01'),
	createdByName: testUser.name
};

describe('/api/projects/[projectId]/test-runs/[runId]/executions/[executionId]/failures', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(authUtils.requireProjectRole).mockResolvedValue({ role: 'PROJECT_ADMIN' });
		mockDb.query.testRun.findFirst = vi.fn().mockResolvedValue(sampleTestRun);
		mockDb.query.testExecution = { findFirst: vi.fn().mockResolvedValue(sampleExecution) };
	});

	describe('GET', () => {
		it('should return failure details', async () => {
			mockSelectResult(mockDb, [sampleFailure]);

			const event = createMockEvent({ params: PARAMS, user: testUser });
			const response = await GET(event);
			const body = await response.json();

			expect(response.status).toBe(200);
			expect(Array.isArray(body.failures)).toBe(true);
			expect(body.failures).toHaveLength(1);
			expect(body.failures[0].errorMessage).toBe('NullPointerException');
		});

		it('should return 401 when unauthenticated', async () => {
			const event = createMockEvent({ params: PARAMS, user: null });
			await expect(GET(event)).rejects.toThrow();
		});
	});

	describe('POST', () => {
		it('should create failure detail for non-VIEWER', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: {
					errorMessage: 'NullPointerException',
					testMethod: 'testLogin()',
					failureEnvironment: 'QA',
					stackTrace: 'java.lang.NullPointerException',
					comment: 'Reproducible'
				},
				user: adminUser
			});
			const response = await POST(event);
			const body = await response.json();

			expect(response.status).toBe(200);
			expect(body.success).toBe(true);
		});

		it('should return 400 for missing required fields', async () => {
			// Pass a body that fails schema validation — all fields are strings with max lengths,
			// but passing a value that exceeds max length triggers a parse failure
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { errorMessage: 'x'.repeat(2001) },
				user: adminUser
			});
			const response = await POST(event);
			const body = await response.json();

			expect(response.status).toBe(400);
			expect(body.error).toMatch(/invalid/i);
		});

		it('should return 401 when unauthenticated', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { errorMessage: 'Error' },
				user: null
			});
			await expect(POST(event)).rejects.toThrow();
		});
	});
});
