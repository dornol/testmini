import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockSelectResult } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import {
	testUser,
	adminUser,
	sampleTestRun,
	sampleExecution
} from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();
const mockAddIssueComment = vi.fn();
const mockLog = vi.hoisted(() => ({
	info: vi.fn(),
	warn: vi.fn(),
	error: vi.fn()
}));

vi.mock('$lib/server/db', () => ({ db: mockDb, col: mockDb.col, sql: mockDb.sql }));
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
	testExecution: {
		id: 'id',
		testRunId: 'test_run_id',
		testCaseVersionId: 'test_case_version_id',
		status: 'status',
		executedBy: 'executed_by',
		executedAt: 'executed_at'
	},
	testCaseVersion: { id: 'id', testCaseId: 'test_case_id' },
	testRun: { id: 'id', projectId: 'project_id' },
	user: { id: 'id', name: 'name' },
	issueLink: {
		id: 'id',
		projectId: 'project_id',
		testCaseId: 'test_case_id',
		externalUrl: 'external_url'
	},
	issueTrackerConfig: {
		projectId: 'project_id',
		enabled: 'enabled',
		provider: 'provider',
		baseUrl: 'base_url',
		apiToken: 'api_token',
		projectKey: 'project_key',
		customTemplate: 'custom_template'
	}
}));
vi.mock('$lib/server/db/auth.schema', () => ({
	user: { id: 'id', name: 'name' }
}));
vi.mock('drizzle-orm', () => ({
	and: vi.fn((...args: unknown[]) => args),
	eq: vi.fn((a: unknown, b: unknown) => [a, b])
}));
vi.mock('$lib/server/auth-utils', async () => {
	const actual =
		await vi.importActual<typeof import('$lib/server/auth-utils')>('$lib/server/auth-utils');
	return {
		...actual,
		requireProjectRole: vi.fn().mockResolvedValue({ role: 'PROJECT_ADMIN' })
	};
});
vi.mock('$lib/schemas/failure.schema', async () => {
	const actual = await vi.importActual<typeof import('$lib/schemas/failure.schema')>(
		'$lib/schemas/failure.schema'
	);
	return actual;
});
vi.mock('$lib/server/issue-tracker', () => ({
	addIssueComment: mockAddIssueComment
}));
vi.mock('$lib/server/logger', () => ({
	childLogger: () => mockLog
}));

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
		mockDb.query.testCaseVersion = { findFirst: vi.fn().mockResolvedValue(null) };
		mockDb.query.issueTrackerConfig = { findFirst: vi.fn().mockResolvedValue(null) };
		mockAddIssueComment.mockResolvedValue(undefined);
	});

	describe('GET', () => {
		it('should return failure details', async () => {
			const selectChain = mockSelectResult(mockDb, [sampleFailure]);

			const event = createMockEvent({ params: PARAMS, user: testUser });
			const response = await GET(event);
			const body = await response.json();

			expect(response.status).toBe(200);
			expect(Array.isArray(body.failures)).toBe(true);
			expect(body.failures).toHaveLength(1);
			expect(body.failures[0].errorMessage).toBe('NullPointerException');
			expect(selectChain.where).toHaveBeenCalledWith(
				expect.arrayContaining([
					['test_execution_id', 200],
					['test_run_id', 50],
					['project_id', 1]
				])
			);
		});

		it('should return 401 when unauthenticated', async () => {
			const event = createMockEvent({ params: PARAMS, user: null });
			await expect(GET(event)).rejects.toThrow();
		});
	});

	describe('POST', () => {
		it('should create failure detail for non-VIEWER', async () => {
			const txUpdateChain = {
				set: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				returning: vi.fn().mockResolvedValue([{ id: sampleExecution.id }])
			};
			const txInsertChain = {
				values: vi.fn().mockReturnThis(),
				returning: vi.fn().mockResolvedValue([{ id: sampleFailure.id }])
			};
			mockDb.transaction.mockImplementationOnce(async (fn) =>
				fn({
					update: vi.fn().mockReturnValue(txUpdateChain),
					insert: vi.fn().mockReturnValue(txInsertChain)
				})
			);

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
			expect(txUpdateChain.where).toHaveBeenCalledWith(
				expect.arrayContaining([
					['id', 200],
					['test_run_id', 50]
				])
			);
			expect(txUpdateChain.returning).toHaveBeenCalledWith({ id: 'id' });
			expect(txInsertChain.values).toHaveBeenCalledWith(
				expect.objectContaining({ testExecutionId: 200 })
			);
			expect(txInsertChain.returning).toHaveBeenCalledWith({ id: 'id' });
		});

		it('should return 404 without inserting failure detail when execution update finds no row', async () => {
			const txUpdateChain = {
				set: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				returning: vi.fn().mockResolvedValue([])
			};
			const txInsertChain = {
				values: vi.fn().mockReturnThis(),
				returning: vi.fn().mockResolvedValue([{ id: sampleFailure.id }])
			};
			mockDb.transaction.mockImplementationOnce(async (fn) =>
				fn({
					update: vi.fn().mockReturnValue(txUpdateChain),
					insert: vi.fn().mockReturnValue(txInsertChain)
				})
			);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { errorMessage: 'Error' },
				user: adminUser
			});

			await expect(POST(event)).rejects.toMatchObject({ status: 404 });
			expect(txUpdateChain.returning).toHaveBeenCalledWith({ id: 'id' });
			expect(txInsertChain.values).not.toHaveBeenCalled();
		});

		it('should return 500 when failure detail insert affects no row', async () => {
			const txUpdateChain = {
				set: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				returning: vi.fn().mockResolvedValue([{ id: sampleExecution.id }])
			};
			const txInsertChain = {
				values: vi.fn().mockReturnThis(),
				returning: vi.fn().mockResolvedValue([])
			};
			mockDb.transaction.mockImplementationOnce(async (fn) =>
				fn({
					update: vi.fn().mockReturnValue(txUpdateChain),
					insert: vi.fn().mockReturnValue(txInsertChain)
				})
			);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { errorMessage: 'Error' },
				user: adminUser
			});

			await expect(POST(event)).rejects.toMatchObject({ status: 500 });
			expect(txInsertChain.returning).toHaveBeenCalledWith({ id: 'id' });
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

		it('should return 400 for unknown fields before writing', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { errorMessage: 'Error', attachmentUrl: 'https://example.com/screenshot.png' },
				user: adminUser
			});
			const response = await POST(event);

			expect(response.status).toBe(400);
			expect(mockDb.transaction).not.toHaveBeenCalled();
		});

		it('should return 400 for non-object JSON before writing', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: ['Error'],
				user: adminUser
			});

			await expect(POST(event)).rejects.toMatchObject({ status: 400 });
			expect(mockDb.transaction).not.toHaveBeenCalled();
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

		it('should return 403 when run is COMPLETED', async () => {
			mockDb.query.testRun.findFirst = vi.fn().mockResolvedValue({
				...sampleTestRun,
				status: 'COMPLETED'
			});

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { errorMessage: 'Error' },
				user: adminUser
			});
			await expect(POST(event)).rejects.toThrow();
		});

		it('should return 404 when execution not found', async () => {
			mockDb.query.testExecution = { findFirst: vi.fn().mockResolvedValue(null) };

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { errorMessage: 'Error' },
				user: adminUser
			});
			await expect(POST(event)).rejects.toThrow();
		});

		it('should log sanitized external issue comment failures', async () => {
			const token = 'issue-comment-token-12345';
			const txUpdateChain = {
				set: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				returning: vi.fn().mockResolvedValue([{ id: sampleExecution.id }])
			};
			const txInsertChain = {
				values: vi.fn().mockReturnThis(),
				returning: vi.fn().mockResolvedValue([{ id: sampleFailure.id }])
			};
			mockDb.transaction.mockImplementationOnce(async (fn) =>
				fn({
					update: vi.fn().mockReturnValue(txUpdateChain),
					insert: vi.fn().mockReturnValue(txInsertChain)
				})
			);
			mockDb.query.testCaseVersion.findFirst.mockResolvedValue({ testCaseId: 10 });
			mockDb.query.issueTrackerConfig.findFirst.mockResolvedValue({
				provider: 'github',
				baseUrl: 'https://api.github.com',
				apiToken: token,
				projectKey: 'ORG/REPO',
				customTemplate: null,
				enabled: true
			});
			mockSelectResult(mockDb, [{ id: 7, projectId: 1, testCaseId: 10, externalUrl: '#1' }]);
			mockAddIssueComment.mockRejectedValueOnce(
				new Error(`GitHub rejected Authorization: Bearer ${token}`)
			);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { errorMessage: 'Error' },
				user: adminUser
			});

			const response = await POST(event);
			await new Promise((resolve) => setTimeout(resolve, 0));

			const [logMeta] = mockLog.warn.mock.calls[0];

			expect(response.status).toBe(200);
			expect(logMeta.err.message).not.toContain(token);
			expect(logMeta.err).not.toHaveProperty('stack');
			expect(logMeta.linkId).toBe(7);
		});
	});

	describe('GET edge cases', () => {
		it('should return empty array when no failures exist', async () => {
			mockSelectResult(mockDb, []);

			const event = createMockEvent({ params: PARAMS, user: testUser });
			const response = await GET(event);
			const body = await response.json();

			expect(response.status).toBe(200);
			expect(body.failures).toHaveLength(0);
		});

		it('should return 404 when run not found', async () => {
			mockDb.query.testRun.findFirst = vi.fn().mockResolvedValue(null);

			const event = createMockEvent({ params: PARAMS, user: testUser });
			await expect(GET(event)).rejects.toThrow();
		});

		it('should return 404 when execution not found', async () => {
			mockDb.query.testExecution = { findFirst: vi.fn().mockResolvedValue(null) };

			const event = createMockEvent({ params: PARAMS, user: testUser });
			await expect(GET(event)).rejects.toThrow();
		});
	});
});
