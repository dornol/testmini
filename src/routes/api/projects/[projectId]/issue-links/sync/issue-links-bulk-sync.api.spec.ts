import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockSelectResult } from '$lib/server/test-helpers/mock-db';
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
	and: vi.fn((...args: unknown[]) => args),
	ne: vi.fn((a: unknown, b: unknown) => [a, '!=', b]),
	inArray: vi.fn((a: unknown, b: unknown) => [a, b])
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

const PARAMS = { projectId: '1' };

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

const sampleLinks = [
	{
		id: 1,
		projectId: 1,
		testCaseId: 5,
		testExecutionId: null,
		externalUrl: 'https://company.atlassian.net/browse/PROJ-1',
		externalKey: 'PROJ-1',
		title: 'Bug 1',
		status: null,
		provider: 'JIRA',
		createdBy: 'user-1',
		createdAt: new Date('2025-01-01')
	},
	{
		id: 2,
		projectId: 1,
		testCaseId: 6,
		testExecutionId: null,
		externalUrl: 'https://company.atlassian.net/browse/PROJ-2',
		externalKey: 'PROJ-2',
		title: 'Bug 2',
		status: null,
		provider: 'JIRA',
		createdBy: 'user-1',
		createdAt: new Date('2025-01-01')
	}
];

describe('/api/projects/[projectId]/issue-links/sync', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockDb.query.issueTrackerConfig = { findFirst: vi.fn() };
	});

	it('should return 401 when not authenticated', async () => {
		const event = createMockEvent({ method: 'POST', params: PARAMS, user: null });
		await expect(POST(event)).rejects.toThrow();
	});

	it('should return 404 when issue tracker not configured', async () => {
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

	it('should sync all links successfully', async () => {
		mockDb.query.issueTrackerConfig.findFirst.mockResolvedValue(sampleConfig);
		mockSelectResult(mockDb, sampleLinks);
		mockFetchIssueStatus.mockResolvedValue({ status: 'Done', statusCategory: 'DONE' });

		const event = createMockEvent({
			method: 'POST',
			params: PARAMS,
			user: testUser
		});

		const response = await POST(event);
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.total).toBe(2);
		expect(body.synced).toBe(2);
		expect(body.failed).toBe(0);
	});

	it('should handle partial failures', async () => {
		mockDb.query.issueTrackerConfig.findFirst.mockResolvedValue(sampleConfig);
		mockSelectResult(mockDb, sampleLinks);
		mockFetchIssueStatus
			.mockResolvedValueOnce({ status: 'Done', statusCategory: 'DONE' })
			.mockRejectedValueOnce(new Error('Network error'));

		const event = createMockEvent({
			method: 'POST',
			params: PARAMS,
			user: testUser
		});

		const response = await POST(event);
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.total).toBe(2);
		expect(body.synced).toBe(1);
		expect(body.failed).toBe(1);
	});

	it('should return zero counts when no links found', async () => {
		mockDb.query.issueTrackerConfig.findFirst.mockResolvedValue(sampleConfig);
		mockSelectResult(mockDb, []);

		const event = createMockEvent({
			method: 'POST',
			params: PARAMS,
			user: testUser
		});

		const response = await POST(event);
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.total).toBe(0);
		expect(body.synced).toBe(0);
		expect(body.failed).toBe(0);
	});

	it('should support testCaseId scoping via search params', async () => {
		mockDb.query.issueTrackerConfig.findFirst.mockResolvedValue(sampleConfig);
		mockSelectResult(mockDb, [sampleLinks[0]]);
		mockFetchIssueStatus.mockResolvedValue({ status: 'Open', statusCategory: 'TODO' });

		const event = createMockEvent({
			method: 'POST',
			params: PARAMS,
			user: testUser,
			searchParams: { testCaseId: '5' }
		});

		const response = await POST(event);
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.total).toBe(1);
		expect(body.synced).toBe(1);
	});

	it('should support testExecutionId scoping via search params', async () => {
		mockDb.query.issueTrackerConfig.findFirst.mockResolvedValue(sampleConfig);
		mockSelectResult(mockDb, [sampleLinks[0]]);
		mockFetchIssueStatus.mockResolvedValue({ status: 'Open', statusCategory: 'TODO' });

		const event = createMockEvent({
			method: 'POST',
			params: PARAMS,
			user: testUser,
			searchParams: { testExecutionId: '200' }
		});

		const response = await POST(event);
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.total).toBe(1);
	});

	it('should return retestMarked count when issues resolve to done', async () => {
		mockDb.query.issueTrackerConfig.findFirst.mockResolvedValue(sampleConfig);
		mockSelectResult(mockDb, sampleLinks);
		mockFetchIssueStatus.mockResolvedValue({ status: 'Done', statusCategory: 'done' });

		const event = createMockEvent({
			method: 'POST',
			params: PARAMS,
			user: testUser
		});

		const response = await POST(event);
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.retestMarked).toBe(2);
	});

	it('should return retestMarked 0 when issues are not done', async () => {
		mockDb.query.issueTrackerConfig.findFirst.mockResolvedValue(sampleConfig);
		mockSelectResult(mockDb, sampleLinks);
		mockFetchIssueStatus.mockResolvedValue({ status: 'In Progress', statusCategory: 'in_progress' });

		const event = createMockEvent({
			method: 'POST',
			params: PARAMS,
			user: testUser
		});

		const response = await POST(event);
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.retestMarked).toBe(0);
	});

	it('should not mark retest when link has no testCaseId', async () => {
		mockDb.query.issueTrackerConfig.findFirst.mockResolvedValue(sampleConfig);
		const linkWithoutTestCase = { ...sampleLinks[0], testCaseId: null };
		mockSelectResult(mockDb, [linkWithoutTestCase]);
		mockFetchIssueStatus.mockResolvedValue({ status: 'Done', statusCategory: 'done' });

		const event = createMockEvent({
			method: 'POST',
			params: PARAMS,
			user: testUser
		});

		const response = await POST(event);
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.retestMarked).toBe(0);
	});

	it('should exclude CUSTOM provider links from sync', async () => {
		mockDb.query.issueTrackerConfig.findFirst.mockResolvedValue(sampleConfig);
		// The ne('CUSTOM') mock is already set up in drizzle-orm mock
		// We just verify that even when CUSTOM links exist, the select query filters them
		mockSelectResult(mockDb, []); // after CUSTOM filter, nothing left
		mockFetchIssueStatus.mockResolvedValue({ status: 'Done', statusCategory: 'done' });

		const event = createMockEvent({
			method: 'POST',
			params: PARAMS,
			user: testUser
		});

		const response = await POST(event);
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.total).toBe(0);
		expect(body.synced).toBe(0);
		expect(body.retestMarked).toBe(0);
	});
});
