import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	createMockDb,
	mockDeleteReturning,
	mockInsertReturning,
	mockUpdateReturning
} from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();
const mockLookup = vi.fn();

vi.mock('$lib/server/db', () => ({ db: mockDb, col: mockDb.col, sql: mockDb.sql }));
vi.mock('dns/promises', () => ({
	lookup: mockLookup
}));
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
	const actual =
		await vi.importActual<typeof import('$lib/server/auth-utils')>('$lib/server/auth-utils');
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
		mockLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
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

		it('should reject non-object request body', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: null
			});

			const response = await POST(event);

			expect(response.status).toBe(400);
			expect((await response.json()).error).toContain('Invalid request body');
		});

		it('should reject base URL with credentials', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: { provider: 'JIRA', baseUrl: 'https://user:password@example.com' }
			});

			const response = await POST(event);

			expect(response.status).toBe(400);
			expect((await response.json()).error).toContain('must not include credentials');
		});

		it('should reject base URL resolving to a private address before querying config', async () => {
			mockLookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: { provider: 'GITLAB', baseUrl: 'https://gitlab.internal.example' }
			});

			const response = await POST(event);

			expect(response.status).toBe(400);
			expect((await response.json()).error).toContain('private or reserved IP');
			expect(mockDb.query.issueTrackerConfig.findFirst).not.toHaveBeenCalled();
			expect(mockDb.insert).not.toHaveBeenCalled();
			expect(mockDb.update).not.toHaveBeenCalled();
		});

		it('should reject non-string API token', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: {
					provider: 'JIRA',
					baseUrl: 'https://company.atlassian.net',
					apiToken: 123
				}
			});

			const response = await POST(event);

			expect(response.status).toBe(400);
			expect((await response.json()).error).toContain('API token must be a string');
		});

		it('should reject non-boolean enabled flag', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: {
					provider: 'JIRA',
					baseUrl: 'https://company.atlassian.net',
					enabled: 'true'
				}
			});

			const response = await POST(event);

			expect(response.status).toBe(400);
			expect((await response.json()).error).toContain('Enabled must be a boolean');
		});

		it('should reject custom template arrays', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: {
					provider: 'CUSTOM',
					baseUrl: 'https://issues.example.com',
					customTemplate: []
				}
			});

			const response = await POST(event);

			expect(response.status).toBe(400);
			expect((await response.json()).error).toContain('Custom template must be an object');
		});

		it('should reject custom template forbidden headers', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: {
					provider: 'CUSTOM',
					baseUrl: 'https://issues.example.com',
					customTemplate: {
						method: 'POST',
						headers: { Authorization: 'Bearer leaked-secret' }
					}
				}
			});

			const response = await POST(event);

			expect(response.status).toBe(400);
			expect((await response.json()).error).toContain('Authorization is not allowed');
			expect(mockDb.insert).not.toHaveBeenCalled();
		});

		it('should reject custom template non-string header values', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: {
					provider: 'CUSTOM',
					baseUrl: 'https://issues.example.com',
					customTemplate: {
						headers: { 'X-Custom': 123 }
					}
				}
			});

			const response = await POST(event);

			expect(response.status).toBe(400);
			expect((await response.json()).error).toContain('X-Custom must be a string');
			expect(mockDb.insert).not.toHaveBeenCalled();
		});

		it('should reject custom template unsupported methods', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: {
					provider: 'CUSTOM',
					baseUrl: 'https://issues.example.com',
					customTemplate: { method: 'TRACE' }
				}
			});

			const response = await POST(event);

			expect(response.status).toBe(400);
			expect((await response.json()).error).toContain('method must be POST, PUT, or PATCH');
			expect(mockDb.insert).not.toHaveBeenCalled();
		});

		it('should store a sanitized custom template', async () => {
			mockDb.query.issueTrackerConfig.findFirst.mockResolvedValue(null);
			const insertChain = mockInsertReturning(mockDb, [
				{
					...sampleConfig,
					provider: 'CUSTOM',
					customTemplate: {
						method: 'PATCH',
						headers: { 'X-Custom': 'value' }
					}
				}
			]);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: {
					provider: 'CUSTOM',
					baseUrl: 'https://issues.example.com',
					customTemplate: {
						method: 'patch',
						headers: { 'X-Custom': 'value' },
						ignoredSecret: 'do-not-store'
					}
				}
			});

			const response = await POST(event);

			expect(response.status).toBe(201);
			expect(mockDb.insert).toHaveBeenCalledWith(expect.anything());
			expect(insertChain.values).toHaveBeenCalledWith(
				expect.objectContaining({
					customTemplate: {
						method: 'PATCH',
						headers: { 'X-Custom': 'value' }
					}
				})
			);
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

		it('should return 500 when new config insert returns no row', async () => {
			mockDb.query.issueTrackerConfig.findFirst.mockResolvedValue(null);
			mockInsertReturning(mockDb, []);

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

			await expect(POST(event)).rejects.toMatchObject({
				status: 500,
				body: { message: 'Failed to create issue tracker config' }
			});
		});

		it('should update existing config', async () => {
			mockDb.query.issueTrackerConfig.findFirst.mockResolvedValueOnce(sampleConfig);
			const updateChain = mockUpdateReturning(mockDb, [
				{ ...sampleConfig, baseUrl: 'https://new.atlassian.net' }
			]);

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
			expect(updateChain.where).toHaveBeenCalledWith(
				expect.arrayContaining([
					['id', 1],
					['project_id', 1]
				])
			);
			expect(mockDb.query.issueTrackerConfig.findFirst).toHaveBeenCalledTimes(1);
		});

		it('should return 404 when existing config disappears before update', async () => {
			mockDb.query.issueTrackerConfig.findFirst.mockResolvedValueOnce(sampleConfig);
			mockUpdateReturning(mockDb, []);

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

			await expect(POST(event)).rejects.toMatchObject({ status: 404 });
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
			mockDeleteReturning(mockDb, [sampleConfig]);
			const event = createMockEvent({ method: 'DELETE', params: PARAMS, user: testUser });

			const response = await DELETE(event);
			expect(response.status).toBe(200);
			expect(await response.json()).toEqual({ success: true });
			expect(mockDb.delete).toHaveBeenCalled();
		});

		it('should return 404 when config does not exist before delete', async () => {
			mockDeleteReturning(mockDb, []);
			const event = createMockEvent({ method: 'DELETE', params: PARAMS, user: testUser });

			await expect(DELETE(event)).rejects.toMatchObject({ status: 404 });
		});
	});
});
