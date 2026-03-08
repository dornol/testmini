import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockInsertReturning } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();
const mockCreateExternalIssue = vi.fn();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	issueTrackerConfig: {
		projectId: 'project_id',
		provider: 'provider'
	},
	issueLink: {
		id: 'id',
		projectId: 'project_id',
		testCaseId: 'test_case_id',
		testExecutionId: 'test_execution_id',
		externalUrl: 'external_url',
		externalKey: 'external_key',
		title: 'title',
		status: 'status',
		provider: 'provider',
		createdBy: 'created_by',
		createdAt: 'created_at'
	}
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b])
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
	createExternalIssue: mockCreateExternalIssue
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

const sampleCreatedLink = {
	id: 1,
	projectId: 1,
	testCaseId: 10,
	testExecutionId: null,
	externalUrl: 'https://company.atlassian.net/browse/PROJ-456',
	externalKey: 'PROJ-456',
	title: 'Login fails on mobile',
	status: null,
	provider: 'JIRA',
	createdBy: 'user-1',
	createdAt: new Date('2025-01-01')
};

describe('/api/projects/[projectId]/issue-links/create-issue', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockDb.query.issueTrackerConfig = { findFirst: vi.fn() };
	});

	it('should return 401 when not authenticated', async () => {
		const event = createMockEvent({ method: 'POST', params: PARAMS, user: null, body: {} });
		await expect(POST(event)).rejects.toThrow();
	});

	it('should reject missing title', async () => {
		const event = createMockEvent({
			method: 'POST',
			params: PARAMS,
			user: testUser,
			body: { testCaseId: 10, title: '', description: 'desc' }
		});

		const response = await POST(event);
		expect(response.status).toBe(400);
		expect((await response.json()).error).toContain('Title is required');
	});

	it('should reject when neither testCaseId nor testExecutionId provided', async () => {
		const event = createMockEvent({
			method: 'POST',
			params: PARAMS,
			user: testUser,
			body: { title: 'Bug title', description: 'desc' }
		});

		const response = await POST(event);
		expect(response.status).toBe(400);
		expect((await response.json()).error).toContain('testCaseId or testExecutionId');
	});

	it('should return 404 when issue tracker not configured', async () => {
		mockDb.query.issueTrackerConfig.findFirst.mockResolvedValue(null);

		const event = createMockEvent({
			method: 'POST',
			params: PARAMS,
			user: testUser,
			body: { testCaseId: 10, title: 'Bug', description: 'desc' }
		});

		const response = await POST(event);
		expect(response.status).toBe(404);
		expect((await response.json()).error).toContain('not configured');
	});

	it('should reject when issue tracker is disabled', async () => {
		mockDb.query.issueTrackerConfig.findFirst.mockResolvedValue({
			...sampleConfig,
			enabled: false
		});

		const event = createMockEvent({
			method: 'POST',
			params: PARAMS,
			user: testUser,
			body: { testCaseId: 10, title: 'Bug', description: 'desc' }
		});

		const response = await POST(event);
		expect(response.status).toBe(400);
		expect((await response.json()).error).toContain('disabled');
	});

	it('should create external issue and return link', async () => {
		mockDb.query.issueTrackerConfig.findFirst.mockResolvedValue(sampleConfig);
		mockCreateExternalIssue.mockResolvedValue({
			url: 'https://company.atlassian.net/browse/PROJ-456',
			key: 'PROJ-456',
			title: 'Login fails on mobile'
		});
		mockInsertReturning(mockDb, [sampleCreatedLink]);

		const event = createMockEvent({
			method: 'POST',
			params: PARAMS,
			user: testUser,
			body: { testCaseId: 10, title: 'Login fails on mobile', description: 'Steps to reproduce...' }
		});

		const response = await POST(event);
		expect(response.status).toBe(201);

		const body = await response.json();
		expect(body.externalUrl).toBe('https://company.atlassian.net/browse/PROJ-456');
		expect(body.externalKey).toBe('PROJ-456');
		expect(body.provider).toBe('JIRA');
	});

	it('should pass correct config to createExternalIssue', async () => {
		mockDb.query.issueTrackerConfig.findFirst.mockResolvedValue(sampleConfig);
		mockCreateExternalIssue.mockResolvedValue({
			url: 'https://example.com/issue/1',
			key: 'KEY-1',
			title: 'Test'
		});
		mockInsertReturning(mockDb, [sampleCreatedLink]);

		const event = createMockEvent({
			method: 'POST',
			params: PARAMS,
			user: testUser,
			body: { testCaseId: 10, title: 'Test', description: 'Description' }
		});

		await POST(event);

		expect(mockCreateExternalIssue).toHaveBeenCalledWith(
			{
				provider: 'JIRA',
				baseUrl: 'https://company.atlassian.net',
				apiToken: 'user@test.com:token',
				projectKey: 'PROJ',
				customTemplate: null
			},
			'Test',
			'Description'
		);
	});

	it('should handle external issue creation failure', async () => {
		mockDb.query.issueTrackerConfig.findFirst.mockResolvedValue(sampleConfig);
		mockCreateExternalIssue.mockRejectedValue(new Error('Jira returned 401: Unauthorized'));

		const event = createMockEvent({
			method: 'POST',
			params: PARAMS,
			user: testUser,
			body: { testCaseId: 10, title: 'Bug', description: 'desc' }
		});

		const response = await POST(event);
		expect(response.status).toBe(400);
		expect((await response.json()).error).toContain('Jira returned 401');
	});

	it('should handle non-Error exceptions from external issue creation', async () => {
		mockDb.query.issueTrackerConfig.findFirst.mockResolvedValue(sampleConfig);
		mockCreateExternalIssue.mockRejectedValue('string error');

		const event = createMockEvent({
			method: 'POST',
			params: PARAMS,
			user: testUser,
			body: { testCaseId: 10, title: 'Bug', description: 'desc' }
		});

		const response = await POST(event);
		expect(response.status).toBe(400);
		expect((await response.json()).error).toContain('Failed to create external issue');
	});

	it('should work with testExecutionId instead of testCaseId', async () => {
		mockDb.query.issueTrackerConfig.findFirst.mockResolvedValue(sampleConfig);
		mockCreateExternalIssue.mockResolvedValue({
			url: 'https://example.com/issue/1',
			key: 'KEY-1',
			title: 'Exec bug'
		});
		mockInsertReturning(mockDb, [
			{ ...sampleCreatedLink, testCaseId: null, testExecutionId: 200 }
		]);

		const event = createMockEvent({
			method: 'POST',
			params: PARAMS,
			user: testUser,
			body: { testExecutionId: 200, title: 'Exec bug', description: 'Failure in test' }
		});

		const response = await POST(event);
		expect(response.status).toBe(201);
	});
});
