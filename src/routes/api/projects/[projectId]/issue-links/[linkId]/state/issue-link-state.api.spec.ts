import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockUpdateReturning } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();
const mockUpdateIssueState = vi.fn();

vi.mock('$lib/server/db', () => ({ db: mockDb, col: mockDb.col, sql: mockDb.sql }));
vi.mock('$lib/server/db/schema', () => ({
	issueLink: {
		id: 'id',
		projectId: 'project_id',
		externalUrl: 'external_url',
		provider: 'provider',
		status: 'status',
		statusSyncedAt: 'status_synced_at',
		testCaseId: 'test_case_id'
	},
	issueTrackerConfig: {
		projectId: 'project_id',
		provider: 'provider',
		baseUrl: 'base_url',
		apiToken: 'api_token',
		projectKey: 'project_key',
		customTemplate: 'custom_template'
	},
	testCase: {
		id: 'id',
		projectId: 'project_id',
		retestNeeded: 'retest_needed'
	}
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	and: vi.fn((...args: unknown[]) => args)
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
vi.mock('$lib/server/issue-tracker', () => ({
	updateIssueState: mockUpdateIssueState
}));

// Add query mocks
mockDb.query.issueLink = { findFirst: vi.fn() } as never;
mockDb.query.issueTrackerConfig = { findFirst: vi.fn() } as never;

const { POST } = await import('./+server');

const PARAMS = { projectId: '1', linkId: '20' };

describe('/api/projects/[projectId]/issue-links/[linkId]/state', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockUpdateReturning(mockDb, [{ id: 20 }]);
	});

	it('should return 401 when not authenticated', async () => {
		const event = createMockEvent({
			method: 'POST',
			params: PARAMS,
			body: { state: 'open' },
			user: null
		});
		await expect(POST(event)).rejects.toThrow();
	});

	it('should return 400 when state is invalid', async () => {
		const event = createMockEvent({
			method: 'POST',
			params: PARAMS,
			body: { state: 'invalid' },
			user: testUser
		});
		const response = await POST(event);
		expect(response.status).toBe(400);
	});

	it('should return 400 when state is empty', async () => {
		const event = createMockEvent({
			method: 'POST',
			params: PARAMS,
			body: { state: '' },
			user: testUser
		});
		const response = await POST(event);
		expect(response.status).toBe(400);
	});

	it('should return 400 when body is not an object', async () => {
		const event = createMockEvent({
			method: 'POST',
			params: PARAMS,
			body: null,
			user: testUser
		});

		const response = await POST(event);

		expect(response.status).toBe(400);
		expect((await response.json()).error).toContain('Invalid request body');
	});

	it('should return 400 when state is not a string', async () => {
		const event = createMockEvent({
			method: 'POST',
			params: PARAMS,
			body: { state: 123 },
			user: testUser
		});

		const response = await POST(event);

		expect(response.status).toBe(400);
		expect((await response.json()).error).toContain('State must be "open" or "closed"');
	});

	it('should return 404 when issue link not found', async () => {
		(mockDb.query.issueLink as { findFirst: ReturnType<typeof vi.fn> }).findFirst.mockResolvedValue(
			null
		);
		const event = createMockEvent({
			method: 'POST',
			params: PARAMS,
			body: { state: 'open' },
			user: testUser
		});
		const response = await POST(event);
		expect(response.status).toBe(404);
	});

	it('should return 404 when issue tracker not configured', async () => {
		(mockDb.query.issueLink as { findFirst: ReturnType<typeof vi.fn> }).findFirst.mockResolvedValue(
			{
				id: 20,
				projectId: 1,
				externalUrl: 'https://jira.example.com/PROJ-1',
				testCaseId: 10
			}
		);
		(
			mockDb.query.issueTrackerConfig as { findFirst: ReturnType<typeof vi.fn> }
		).findFirst.mockResolvedValue(null);

		const event = createMockEvent({
			method: 'POST',
			params: PARAMS,
			body: { state: 'open' },
			user: testUser
		});
		const response = await POST(event);
		expect(response.status).toBe(404);
	});

	it('should update state to open on success', async () => {
		(mockDb.query.issueLink as { findFirst: ReturnType<typeof vi.fn> }).findFirst.mockResolvedValue(
			{
				id: 20,
				projectId: 1,
				externalUrl: 'https://jira.example.com/PROJ-1',
				testCaseId: null
			}
		);
		(
			mockDb.query.issueTrackerConfig as { findFirst: ReturnType<typeof vi.fn> }
		).findFirst.mockResolvedValue({
			projectId: 1,
			provider: 'JIRA',
			baseUrl: 'https://jira.example.com',
			apiToken: 'token',
			projectKey: 'PROJ',
			customTemplate: null
		});
		mockUpdateIssueState.mockResolvedValue(undefined);

		const updateChain = mockUpdateReturning(mockDb, [{ id: 20 }]);

		const event = createMockEvent({
			method: 'POST',
			params: PARAMS,
			body: { state: 'open' },
			user: testUser
		});
		const response = await POST(event);
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.success).toBe(true);
		expect(body.state).toBe('open');
		expect(mockUpdateIssueState).toHaveBeenCalledOnce();
		expect(updateChain.where).toHaveBeenCalledWith(
			expect.arrayContaining([
				['id', 20],
				['project_id', 1]
			])
		);
		expect(updateChain.returning).toHaveBeenCalledWith({ id: 'id' });
	});

	it('should return 404 when local issue link disappears after external state update', async () => {
		(mockDb.query.issueLink as { findFirst: ReturnType<typeof vi.fn> }).findFirst.mockResolvedValue(
			{
				id: 20,
				projectId: 1,
				externalUrl: 'https://jira.example.com/PROJ-1',
				testCaseId: null
			}
		);
		(
			mockDb.query.issueTrackerConfig as { findFirst: ReturnType<typeof vi.fn> }
		).findFirst.mockResolvedValue({
			projectId: 1,
			provider: 'JIRA',
			baseUrl: 'https://jira.example.com',
			apiToken: 'token',
			projectKey: 'PROJ',
			customTemplate: null
		});
		mockUpdateIssueState.mockResolvedValue(undefined);
		mockUpdateReturning(mockDb, []);

		const event = createMockEvent({
			method: 'POST',
			params: PARAMS,
			body: { state: 'open' },
			user: testUser
		});

		await expect(POST(event)).rejects.toThrow();
		expect(mockUpdateIssueState).toHaveBeenCalledOnce();
	});

	it('should mark test case for retest when closing issue with linked test case', async () => {
		(mockDb.query.issueLink as { findFirst: ReturnType<typeof vi.fn> }).findFirst.mockResolvedValue(
			{
				id: 20,
				projectId: 1,
				externalUrl: 'https://jira.example.com/PROJ-1',
				testCaseId: 10
			}
		);
		(
			mockDb.query.issueTrackerConfig as { findFirst: ReturnType<typeof vi.fn> }
		).findFirst.mockResolvedValue({
			projectId: 1,
			provider: 'JIRA',
			baseUrl: 'https://jira.example.com',
			apiToken: 'token',
			projectKey: 'PROJ',
			customTemplate: null
		});
		mockUpdateIssueState.mockResolvedValue(undefined);

		const issueLinkUpdateChain = {
			set: vi.fn().mockReturnThis(),
			where: vi.fn().mockReturnThis(),
			returning: vi.fn().mockResolvedValue([{ id: 20 }]),
			then: (r: (v: unknown) => void) => Promise.resolve(undefined).then(r)
		};
		const testCaseUpdateChain = {
			set: vi.fn().mockReturnThis(),
			where: vi.fn().mockReturnThis(),
			returning: vi.fn().mockResolvedValue([{ id: 10 }]),
			then: (r: (v: unknown) => void) => Promise.resolve(undefined).then(r)
		};
		const txUpdate = vi
			.fn()
			.mockReturnValueOnce(issueLinkUpdateChain)
			.mockReturnValueOnce(testCaseUpdateChain);
		mockDb.transaction.mockImplementationOnce(async (fn) => fn({ update: txUpdate }));

		const event = createMockEvent({
			method: 'POST',
			params: PARAMS,
			body: { state: 'closed' },
			user: testUser
		});
		const response = await POST(event);
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.success).toBe(true);
		expect(body.state).toBe('closed');
		expect(mockDb.transaction).toHaveBeenCalledTimes(1);
		expect(txUpdate).toHaveBeenCalledTimes(2);
		expect(txUpdate).toHaveBeenNthCalledWith(1, expect.objectContaining({ id: 'id' }));
		expect(txUpdate).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({ retestNeeded: 'retest_needed' })
		);
		expect(issueLinkUpdateChain.where).toHaveBeenCalledWith(
			expect.arrayContaining([
				['id', 20],
				['project_id', 1]
			])
		);
		expect(issueLinkUpdateChain.returning).toHaveBeenCalledWith({ id: 'id' });
		expect(testCaseUpdateChain.where).toHaveBeenCalledWith(
			expect.arrayContaining([
				['id', 10],
				['project_id', 1]
			])
		);
		expect(testCaseUpdateChain.returning).toHaveBeenCalledWith({ id: 'id' });
		expect(mockDb.update).not.toHaveBeenCalled();
	});

	it('should return 404 without retest update when local issue link disappears in transaction', async () => {
		(mockDb.query.issueLink as { findFirst: ReturnType<typeof vi.fn> }).findFirst.mockResolvedValue(
			{
				id: 20,
				projectId: 1,
				externalUrl: 'https://jira.example.com/PROJ-1',
				testCaseId: 10
			}
		);
		(
			mockDb.query.issueTrackerConfig as { findFirst: ReturnType<typeof vi.fn> }
		).findFirst.mockResolvedValue({
			projectId: 1,
			provider: 'JIRA',
			baseUrl: 'https://jira.example.com',
			apiToken: 'token',
			projectKey: 'PROJ',
			customTemplate: null
		});
		mockUpdateIssueState.mockResolvedValue(undefined);

		const issueLinkUpdateChain = {
			set: vi.fn().mockReturnThis(),
			where: vi.fn().mockReturnThis(),
			returning: vi.fn().mockResolvedValue([])
		};
		const txUpdate = vi.fn().mockReturnValueOnce(issueLinkUpdateChain);
		mockDb.transaction.mockImplementationOnce(async (fn) => fn({ update: txUpdate }));

		const event = createMockEvent({
			method: 'POST',
			params: PARAMS,
			body: { state: 'closed' },
			user: testUser
		});

		await expect(POST(event)).rejects.toThrow();
		expect(mockUpdateIssueState).toHaveBeenCalledOnce();
		expect(txUpdate).toHaveBeenCalledTimes(1);
	});
});
