import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockUpdateReturning } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();
const mockFetchIssueStatus = vi.fn();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	issueLink: {
		id: 'id',
		projectId: 'project_id',
		testCaseId: 'test_case_id',
		testExecutionId: 'test_execution_id',
		externalUrl: 'external_url',
		externalKey: 'external_key',
		title: 'title',
		status: 'status',
		statusSyncedAt: 'status_synced_at',
		provider: 'provider',
		createdBy: 'created_by',
		createdAt: 'created_at'
	},
	issueTrackerConfig: {
		projectId: 'project_id',
		provider: 'provider'
	},
	testCase: {
		id: 'id',
		retestNeeded: 'retest_needed'
	}
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	and: vi.fn((...args: unknown[]) => args)
}));
vi.mock('$lib/server/auth-utils', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/auth-utils')>(
		'$lib/server/auth-utils'
	);
	return {
		...actual,
		requireProjectAccess: vi.fn().mockResolvedValue({ role: 'QA' }),
		requireProjectRole: vi.fn().mockResolvedValue({ role: 'QA' })
	};
});
vi.mock('$lib/server/issue-tracker', () => ({
	fetchIssueStatus: mockFetchIssueStatus
}));

const { POST } = await import('./+server');

const PARAMS = { projectId: '1', linkId: '10' };

const sampleLink = {
	id: 10,
	projectId: 1,
	testCaseId: 5,
	testExecutionId: null,
	externalUrl: 'https://company.atlassian.net/browse/PROJ-123',
	externalKey: 'PROJ-123',
	title: 'Login bug',
	status: null,
	provider: 'JIRA',
	createdBy: 'user-1',
	createdAt: new Date('2025-01-01')
};

const sampleConfig = {
	id: 1,
	projectId: 1,
	provider: 'JIRA',
	baseUrl: 'https://company.atlassian.net',
	apiToken: 'user@test.com:token',
	projectKey: 'PROJ',
	customTemplate: null,
	enabled: true
};

describe('/api/projects/[projectId]/issue-links/[linkId]/sync', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockDb.query.issueLink = { findFirst: vi.fn() };
		mockDb.query.issueTrackerConfig = { findFirst: vi.fn() };
	});

	it('should return 401 when not authenticated', async () => {
		const event = createMockEvent({ method: 'POST', params: PARAMS, user: null });
		await expect(POST(event)).rejects.toThrow();
	});

	it('should return 404 when link not found', async () => {
		mockDb.query.issueLink.findFirst.mockResolvedValue(undefined);

		const event = createMockEvent({
			method: 'POST',
			params: PARAMS,
			user: testUser
		});

		const response = await POST(event);
		expect(response.status).toBe(404);
		expect((await response.json()).error).toContain('not found');
	});

	it('should reject sync for CUSTOM provider', async () => {
		mockDb.query.issueLink.findFirst.mockResolvedValue({
			...sampleLink,
			provider: 'CUSTOM'
		});

		const event = createMockEvent({
			method: 'POST',
			params: PARAMS,
			user: testUser
		});

		const response = await POST(event);
		expect(response.status).toBe(400);
		expect((await response.json()).error).toContain('custom');
	});

	it('should return 404 when issue tracker not configured', async () => {
		mockDb.query.issueLink.findFirst.mockResolvedValue(sampleLink);
		mockDb.query.issueTrackerConfig.findFirst.mockResolvedValue(undefined);

		const event = createMockEvent({
			method: 'POST',
			params: PARAMS,
			user: testUser
		});

		const response = await POST(event);
		expect(response.status).toBe(404);
		expect((await response.json()).error).toContain('not configured');
	});

	it('should sync issue status successfully', async () => {
		mockDb.query.issueLink.findFirst.mockResolvedValue(sampleLink);
		mockDb.query.issueTrackerConfig.findFirst.mockResolvedValue(sampleConfig);
		mockFetchIssueStatus.mockResolvedValue({
			status: 'In Progress',
			statusCategory: 'IN_PROGRESS'
		});
		const updatedLink = { ...sampleLink, status: 'In Progress', statusSyncedAt: new Date() };
		mockUpdateReturning(mockDb, [updatedLink]);

		const event = createMockEvent({
			method: 'POST',
			params: PARAMS,
			user: testUser
		});

		const response = await POST(event);
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.status).toBe('In Progress');
		expect(body.statusCategory).toBe('IN_PROGRESS');
	});

	it('should pass correct config to fetchIssueStatus', async () => {
		mockDb.query.issueLink.findFirst.mockResolvedValue(sampleLink);
		mockDb.query.issueTrackerConfig.findFirst.mockResolvedValue(sampleConfig);
		mockFetchIssueStatus.mockResolvedValue({ status: 'Done', statusCategory: 'DONE' });
		mockUpdateReturning(mockDb, [{ ...sampleLink, status: 'Done' }]);

		const event = createMockEvent({
			method: 'POST',
			params: PARAMS,
			user: testUser
		});

		await POST(event);

		expect(mockFetchIssueStatus).toHaveBeenCalledWith(
			{
				provider: 'JIRA',
				baseUrl: 'https://company.atlassian.net',
				apiToken: 'user@test.com:token',
				projectKey: 'PROJ',
				customTemplate: null
			},
			'https://company.atlassian.net/browse/PROJ-123',
			'PROJ-123'
		);
	});

	it('should mark linked test case as retest needed when issue is resolved', async () => {
		mockDb.query.issueLink.findFirst.mockResolvedValue(sampleLink);
		mockDb.query.issueTrackerConfig.findFirst.mockResolvedValue(sampleConfig);
		mockFetchIssueStatus.mockResolvedValue({ status: 'Done', statusCategory: 'done' });

		const updatedLink = { ...sampleLink, status: 'Done', statusSyncedAt: new Date() };
		mockUpdateReturning(mockDb, [updatedLink]);

		// Mock the second update call (retest flag)
		const retestUpdateChain = {
			set: vi.fn().mockReturnThis(),
			where: vi.fn().mockReturnThis(),
			then: (r: (v: unknown) => void) => Promise.resolve(undefined).then(r)
		};
		mockDb.update.mockReturnValueOnce(
			// first call returns the link update chain from mockUpdateReturning above
			mockDb.update.getMockImplementation()?.() ?? retestUpdateChain as never
		).mockReturnValue(retestUpdateChain as never);

		const event = createMockEvent({
			method: 'POST',
			params: PARAMS,
			user: testUser
		});

		const response = await POST(event);
		expect(response.status).toBe(200);
		// The update mock should have been called twice: once for link, once for testCase retest
		expect(mockDb.update).toHaveBeenCalledTimes(2);
	});

	it('should not mark retest when issue is not resolved', async () => {
		mockDb.query.issueLink.findFirst.mockResolvedValue(sampleLink);
		mockDb.query.issueTrackerConfig.findFirst.mockResolvedValue(sampleConfig);
		mockFetchIssueStatus.mockResolvedValue({ status: 'In Progress', statusCategory: 'in_progress' });
		mockUpdateReturning(mockDb, [{ ...sampleLink, status: 'In Progress' }]);

		const event = createMockEvent({
			method: 'POST',
			params: PARAMS,
			user: testUser
		});

		const response = await POST(event);
		expect(response.status).toBe(200);
		// Only one update call: the link status update
		expect(mockDb.update).toHaveBeenCalledTimes(1);
	});

	it('should not mark retest when link has no testCaseId', async () => {
		const linkWithoutTestCase = { ...sampleLink, testCaseId: null };
		mockDb.query.issueLink.findFirst.mockResolvedValue(linkWithoutTestCase);
		mockDb.query.issueTrackerConfig.findFirst.mockResolvedValue(sampleConfig);
		mockFetchIssueStatus.mockResolvedValue({ status: 'Done', statusCategory: 'done' });
		mockUpdateReturning(mockDb, [{ ...linkWithoutTestCase, status: 'Done' }]);

		const event = createMockEvent({
			method: 'POST',
			params: PARAMS,
			user: testUser
		});

		const response = await POST(event);
		expect(response.status).toBe(200);
		// Only one update call: the link status update
		expect(mockDb.update).toHaveBeenCalledTimes(1);
	});

	it('should reject invalid link ID', async () => {
		const event = createMockEvent({
			method: 'POST',
			params: { projectId: '1', linkId: 'abc' },
			user: testUser
		});

		await expect(POST(event)).rejects.toThrow();
	});
});
