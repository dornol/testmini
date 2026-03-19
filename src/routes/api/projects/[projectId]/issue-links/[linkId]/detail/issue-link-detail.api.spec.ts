import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();
const mockFetchIssueDetail = vi.fn();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	issueLink: {
		id: 'id',
		projectId: 'project_id',
		externalUrl: 'external_url',
		provider: 'provider',
		status: 'status',
		statusSyncedAt: 'status_synced_at'
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
	fetchIssueDetail: mockFetchIssueDetail
}));

// Add query mocks
mockDb.query.issueLink = { findFirst: vi.fn() } as never;
mockDb.query.issueTrackerConfig = { findFirst: vi.fn() } as never;

const { GET } = await import('./+server');

const PARAMS = { projectId: '1', linkId: '20' };

describe('/api/projects/[projectId]/issue-links/[linkId]/detail', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should return 401 when not authenticated', async () => {
		const event = createMockEvent({ params: PARAMS, user: null });
		await expect(GET(event)).rejects.toThrow();
	});

	it('should return 404 when issue link not found', async () => {
		(mockDb.query.issueLink as { findFirst: ReturnType<typeof vi.fn> }).findFirst.mockResolvedValue(null);
		const event = createMockEvent({ params: PARAMS, user: testUser });
		const response = await GET(event);
		expect(response.status).toBe(404);
	});

	it('should return 400 for CUSTOM provider', async () => {
		(mockDb.query.issueLink as { findFirst: ReturnType<typeof vi.fn> }).findFirst.mockResolvedValue({
			id: 20, projectId: 1, externalUrl: 'https://example.com/issue', provider: 'CUSTOM'
		});
		const event = createMockEvent({ params: PARAMS, user: testUser });
		const response = await GET(event);
		expect(response.status).toBe(400);
	});

	it('should return 404 when issue tracker not configured', async () => {
		(mockDb.query.issueLink as { findFirst: ReturnType<typeof vi.fn> }).findFirst.mockResolvedValue({
			id: 20, projectId: 1, externalUrl: 'https://jira.example.com/PROJ-1', provider: 'JIRA'
		});
		(mockDb.query.issueTrackerConfig as { findFirst: ReturnType<typeof vi.fn> }).findFirst.mockResolvedValue(null);

		const event = createMockEvent({ params: PARAMS, user: testUser });
		const response = await GET(event);
		expect(response.status).toBe(404);
	});

	it('should return 400 when fetchIssueDetail returns null', async () => {
		(mockDb.query.issueLink as { findFirst: ReturnType<typeof vi.fn> }).findFirst.mockResolvedValue({
			id: 20, projectId: 1, externalUrl: 'https://jira.example.com/PROJ-1', provider: 'JIRA'
		});
		(mockDb.query.issueTrackerConfig as { findFirst: ReturnType<typeof vi.fn> }).findFirst.mockResolvedValue({
			projectId: 1, provider: 'JIRA', baseUrl: 'https://jira.example.com',
			apiToken: 'token', projectKey: 'PROJ', customTemplate: null
		});
		mockFetchIssueDetail.mockResolvedValue(null);

		const event = createMockEvent({ params: PARAMS, user: testUser });
		const response = await GET(event);
		expect(response.status).toBe(400);
	});

	it('should return issue detail and update local status on success', async () => {
		(mockDb.query.issueLink as { findFirst: ReturnType<typeof vi.fn> }).findFirst.mockResolvedValue({
			id: 20, projectId: 1, externalUrl: 'https://jira.example.com/PROJ-1', provider: 'JIRA'
		});
		(mockDb.query.issueTrackerConfig as { findFirst: ReturnType<typeof vi.fn> }).findFirst.mockResolvedValue({
			projectId: 1, provider: 'JIRA', baseUrl: 'https://jira.example.com',
			apiToken: 'token', projectKey: 'PROJ', customTemplate: null
		});
		const detail = {
			key: 'PROJ-1',
			title: 'Bug in login',
			state: 'open',
			description: 'Details here',
			labels: ['bug']
		};
		mockFetchIssueDetail.mockResolvedValue(detail);

		const updateChain = {
			set: vi.fn().mockReturnThis(),
			where: vi.fn().mockReturnThis(),
			then: (r: (v: unknown) => void) => Promise.resolve(undefined).then(r)
		};
		mockDb.update.mockReturnValue(updateChain as never);

		const event = createMockEvent({ params: PARAMS, user: testUser });
		const response = await GET(event);
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.key).toBe('PROJ-1');
		expect(body.state).toBe('open');
		expect(mockFetchIssueDetail).toHaveBeenCalledOnce();
	});
});
