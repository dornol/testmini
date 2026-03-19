import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();
const mockAddIssueComment = vi.fn();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	issueLink: {
		id: 'id',
		projectId: 'project_id',
		externalUrl: 'external_url',
		provider: 'provider'
	},
	issueTrackerConfig: {
		projectId: 'project_id',
		provider: 'provider',
		baseUrl: 'base_url',
		apiToken: 'api_token',
		projectKey: 'project_key',
		customTemplate: 'custom_template'
	}
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	and: vi.fn((...args: unknown[]) => args)
}));
vi.mock('$lib/server/auth-utils', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/auth-utils')>('$lib/server/auth-utils');
	return {
		...actual,
		requireProjectAccess: vi.fn().mockResolvedValue({ role: 'QA' }),
		requireProjectRole: vi.fn().mockResolvedValue({ role: 'QA' })
	};
});
vi.mock('$lib/server/issue-tracker', () => ({
	addIssueComment: mockAddIssueComment
}));

// Add query mocks
mockDb.query.issueLink = { findFirst: vi.fn() } as never;
mockDb.query.issueTrackerConfig = { findFirst: vi.fn() } as never;

const { POST } = await import('./+server');

const PARAMS = { projectId: '1', linkId: '20' };

describe('/api/projects/[projectId]/issue-links/[linkId]/comment', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should return 401 when not authenticated', async () => {
		const event = createMockEvent({
			method: 'POST',
			params: PARAMS,
			body: { comment: 'Hello' },
			user: null
		});
		await expect(POST(event)).rejects.toThrow();
	});

	it('should return 400 when comment is empty', async () => {
		const event = createMockEvent({
			method: 'POST',
			params: PARAMS,
			body: { comment: '' },
			user: testUser
		});
		const response = await POST(event);
		expect(response.status).toBe(400);
	});

	it('should return 400 when comment is whitespace only', async () => {
		const event = createMockEvent({
			method: 'POST',
			params: PARAMS,
			body: { comment: '   ' },
			user: testUser
		});
		const response = await POST(event);
		expect(response.status).toBe(400);
	});

	it('should return 404 when issue link not found', async () => {
		(mockDb.query.issueLink as { findFirst: ReturnType<typeof vi.fn> }).findFirst.mockResolvedValue(null);
		const event = createMockEvent({
			method: 'POST',
			params: PARAMS,
			body: { comment: 'Test comment' },
			user: testUser
		});
		const response = await POST(event);
		expect(response.status).toBe(404);
	});

	it('should return 404 when issue tracker not configured', async () => {
		(mockDb.query.issueLink as { findFirst: ReturnType<typeof vi.fn> }).findFirst.mockResolvedValue({
			id: 20, projectId: 1, externalUrl: 'https://jira.example.com/PROJ-1'
		});
		(mockDb.query.issueTrackerConfig as { findFirst: ReturnType<typeof vi.fn> }).findFirst.mockResolvedValue(null);

		const event = createMockEvent({
			method: 'POST',
			params: PARAMS,
			body: { comment: 'Test comment' },
			user: testUser
		});
		const response = await POST(event);
		expect(response.status).toBe(404);
	});

	it('should post comment on success', async () => {
		(mockDb.query.issueLink as { findFirst: ReturnType<typeof vi.fn> }).findFirst.mockResolvedValue({
			id: 20, projectId: 1, externalUrl: 'https://jira.example.com/PROJ-1'
		});
		(mockDb.query.issueTrackerConfig as { findFirst: ReturnType<typeof vi.fn> }).findFirst.mockResolvedValue({
			projectId: 1, provider: 'JIRA', baseUrl: 'https://jira.example.com',
			apiToken: 'token', projectKey: 'PROJ', customTemplate: null
		});
		mockAddIssueComment.mockResolvedValue(undefined);

		const event = createMockEvent({
			method: 'POST',
			params: PARAMS,
			body: { comment: 'This is fixed' },
			user: testUser
		});
		const response = await POST(event);
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.success).toBe(true);
		expect(mockAddIssueComment).toHaveBeenCalledOnce();
	});
});
