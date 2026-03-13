import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockInsertReturning } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	issueTrackerConfig: {
		id: 'id',
		projectId: 'project_id',
		provider: 'provider',
		baseUrl: 'base_url',
		apiToken: 'api_token',
		projectKey: 'project_key',
		customTemplate: 'custom_template',
		enabled: 'enabled',
		webhookSecret: 'webhook_secret',
		createdBy: 'created_by',
		createdAt: 'created_at'
	}
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	and: vi.fn((...args: unknown[]) => args),
	desc: vi.fn((a: unknown) => ['desc', a])
}));
vi.mock('$lib/server/auth-utils', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/auth-utils')>(
		'$lib/server/auth-utils'
	);
	return {
		...actual,
		requireProjectAccess: vi.fn().mockResolvedValue({ role: 'QA' }),
		requireProjectRole: vi.fn().mockResolvedValue({ role: 'PROJECT_ADMIN' })
	};
});

const { GET, POST, DELETE } = await import('./+server');

const PARAMS = { projectId: '1' };

const sampleConfig = {
	id: 1,
	projectId: 1,
	provider: 'JIRA',
	baseUrl: 'https://company.atlassian.net',
	apiToken: 'user@test.com:secret-token',
	projectKey: 'PROJ',
	customTemplate: null,
	enabled: true,
	webhookSecret: null,
	createdBy: 'user-1',
	createdAt: new Date('2025-01-01')
};

describe('/api/projects/[projectId]/issue-tracker', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockDb.query.issueTrackerConfig = { findFirst: vi.fn() };
	});

	// ── GET ─────────────────────────────────────────────
	describe('GET', () => {
		it('should return 401 when not authenticated', async () => {
			const event = createMockEvent({ params: PARAMS, user: null });
			await expect(GET(event)).rejects.toThrow();
		});

		it('should return null when no config exists', async () => {
			mockDb.query.issueTrackerConfig.findFirst.mockResolvedValue(null);
			const event = createMockEvent({ params: PARAMS, user: testUser });

			const response = await GET(event);
			expect(response.status).toBe(200);
			expect(await response.json()).toBeNull();
		});

		it('should return config with masked apiToken', async () => {
			mockDb.query.issueTrackerConfig.findFirst.mockResolvedValue(sampleConfig);
			const event = createMockEvent({ params: PARAMS, user: testUser });

			const response = await GET(event);
			expect(response.status).toBe(200);

			const body = await response.json();
			expect(body).toMatchObject({
				id: 1,
				provider: 'JIRA',
				baseUrl: 'https://company.atlassian.net',
				projectKey: 'PROJ',
				enabled: true,
				hasApiToken: true
			});
			// apiToken should NOT be exposed
			expect(body.apiToken).toBeUndefined();
		});

		it('should return hasApiToken=false when no token stored', async () => {
			mockDb.query.issueTrackerConfig.findFirst.mockResolvedValue({
				...sampleConfig,
				apiToken: null
			});
			const event = createMockEvent({ params: PARAMS, user: testUser });

			const response = await GET(event);
			const body = await response.json();
			expect(body.hasApiToken).toBe(false);
		});

		it('should return hasWebhookSecret in response', async () => {
			mockDb.query.issueTrackerConfig.findFirst.mockResolvedValue({
				...sampleConfig,
				webhookSecret: 'secret123'
			});
			const event = createMockEvent({ params: PARAMS, user: testUser });

			const response = await GET(event);
			const body = await response.json();
			expect(body.hasWebhookSecret).toBe(true);
		});
	});

	// ── POST ────────────────────────────────────────────
	describe('POST', () => {
		it('should return 401 when not authenticated', async () => {
			const event = createMockEvent({ method: 'POST', params: PARAMS, user: null, body: {} });
			await expect(POST(event)).rejects.toThrow();
		});

		it('should reject invalid provider', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: { provider: 'INVALID', baseUrl: 'https://example.com' }
			});

			const response = await POST(event);
			expect(response.status).toBe(400);
			const body = await response.json();
			expect(body.error).toContain('Provider must be one of');
		});

		it('should reject empty provider', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: { provider: '', baseUrl: 'https://example.com' }
			});

			const response = await POST(event);
			expect(response.status).toBe(400);
		});

		it('should reject missing base URL', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: { provider: 'JIRA', baseUrl: '' }
			});

			const response = await POST(event);
			expect(response.status).toBe(400);
			const body = await response.json();
			expect(body.error).toContain('Base URL is required');
		});

		it('should reject invalid base URL', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: { provider: 'JIRA', baseUrl: 'not-a-url' }
			});

			const response = await POST(event);
			expect(response.status).toBe(400);
			expect((await response.json()).error).toContain('Invalid base URL');
		});

		it('should reject non-http URL', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: { provider: 'JIRA', baseUrl: 'ftp://example.com' }
			});

			const response = await POST(event);
			expect(response.status).toBe(400);
			expect((await response.json()).error).toContain('http or https');
		});

		it('should reject invalid request body', async () => {
			const request = new Request('http://localhost/api/test', {
				method: 'POST',
				headers: { 'Content-Type': 'text/plain' },
				body: 'not json'
			});

			const event = createMockEvent({ method: 'POST', params: PARAMS, user: testUser });
			(event as Record<string, unknown>).request = request;

			await expect(POST(event)).rejects.toThrow();
		});

		it('should create new config when none exists', async () => {
			mockDb.query.issueTrackerConfig.findFirst.mockResolvedValue(null);

			const created = {
				...sampleConfig,
				id: 1,
				createdAt: new Date()
			};
			mockInsertReturning(mockDb, [created]);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: {
					provider: 'JIRA',
					baseUrl: 'https://company.atlassian.net',
					apiToken: 'user@test.com:token',
					projectKey: 'PROJ'
				}
			});

			const response = await POST(event);
			expect(response.status).toBe(201);

			const body = await response.json();
			expect(body.provider).toBe('JIRA');
			expect(body.hasApiToken).toBe(true);
			expect(body.apiToken).toBeUndefined();
		});

		it('should update existing config', async () => {
			mockDb.query.issueTrackerConfig.findFirst
				.mockResolvedValueOnce(sampleConfig) // existing check
				.mockResolvedValueOnce({ ...sampleConfig, baseUrl: 'https://new.atlassian.net' }); // after update

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: {
					provider: 'JIRA',
					baseUrl: 'https://new.atlassian.net',
					projectKey: 'PROJ'
				}
			});

			const response = await POST(event);
			expect(response.status).toBe(200);

			const body = await response.json();
			expect(body.baseUrl).toBe('https://new.atlassian.net');
		});

		it('should accept all valid providers', async () => {
			for (const provider of ['JIRA', 'GITHUB', 'GITLAB', 'GITEA', 'CUSTOM']) {
				mockDb.query.issueTrackerConfig.findFirst.mockResolvedValue(null);
				mockInsertReturning(mockDb, [{ ...sampleConfig, provider }]);

				const event = createMockEvent({
					method: 'POST',
					params: PARAMS,
					user: testUser,
					body: { provider, baseUrl: 'https://example.com' }
				});

				const response = await POST(event);
				expect(response.status).toBe(201);
			}
		});

		it('should accept GITEA provider', async () => {
			mockDb.query.issueTrackerConfig.findFirst.mockResolvedValue(null);
			mockInsertReturning(mockDb, [{ ...sampleConfig, provider: 'GITEA' }]);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: { provider: 'GITEA', baseUrl: 'https://gitea.example.com' }
			});

			const response = await POST(event);
			expect(response.status).toBe(201);
			const body = await response.json();
			expect(body.provider).toBe('GITEA');
		});

		it('should save webhookSecret when provided', async () => {
			mockDb.query.issueTrackerConfig.findFirst.mockResolvedValue(null);
			mockInsertReturning(mockDb, [{ ...sampleConfig, webhookSecret: 'my-secret' }]);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: {
					provider: 'JIRA',
					baseUrl: 'https://company.atlassian.net',
					webhookSecret: 'my-secret'
				}
			});

			const response = await POST(event);
			expect(response.status).toBe(201);
		});
	});

	// ── DELETE ───────────────────────────────────────────
	describe('DELETE', () => {
		it('should return 401 when not authenticated', async () => {
			const event = createMockEvent({ method: 'DELETE', params: PARAMS, user: null });
			await expect(DELETE(event)).rejects.toThrow();
		});

		it('should delete config and return success', async () => {
			const event = createMockEvent({ method: 'DELETE', params: PARAMS, user: testUser });

			const response = await DELETE(event);
			expect(response.status).toBe(200);
			expect(await response.json()).toEqual({ success: true });
			expect(mockDb.delete).toHaveBeenCalled();
		});
	});
});
