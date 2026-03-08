import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();
const mockTestConnection = vi.fn();

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
		enabled: 'enabled'
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
		requireProjectAccess: vi.fn().mockResolvedValue({ role: 'PROJECT_ADMIN' }),
		requireProjectRole: vi.fn().mockResolvedValue({ role: 'PROJECT_ADMIN' })
	};
});
vi.mock('$lib/server/issue-tracker', () => ({
	testConnection: mockTestConnection
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

describe('/api/projects/[projectId]/issue-tracker/test', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockDb.query.issueTrackerConfig = { findFirst: vi.fn() };
	});

	it('should return 401 when not authenticated', async () => {
		const event = createMockEvent({ method: 'POST', params: PARAMS, user: null, body: {} });
		await expect(POST(event)).rejects.toThrow();
	});

	it('should return 404 when no config exists', async () => {
		mockDb.query.issueTrackerConfig.findFirst.mockResolvedValue(null);
		const event = createMockEvent({ method: 'POST', params: PARAMS, user: testUser, body: {} });

		const response = await POST(event);
		expect(response.status).toBe(404);
		expect((await response.json()).error).toContain('not configured');
	});

	it('should return ok=false when tracker is disabled', async () => {
		mockDb.query.issueTrackerConfig.findFirst.mockResolvedValue({
			...sampleConfig,
			enabled: false
		});
		const event = createMockEvent({ method: 'POST', params: PARAMS, user: testUser, body: {} });

		const response = await POST(event);
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.ok).toBe(false);
		expect(body.message).toContain('disabled');
	});

	it('should return testConnection result on success', async () => {
		mockDb.query.issueTrackerConfig.findFirst.mockResolvedValue(sampleConfig);
		mockTestConnection.mockResolvedValue({ ok: true, message: 'Connected as Test User' });

		const event = createMockEvent({ method: 'POST', params: PARAMS, user: testUser, body: {} });

		const response = await POST(event);
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.ok).toBe(true);
		expect(body.message).toBe('Connected as Test User');
	});

	it('should pass correct config to testConnection', async () => {
		mockDb.query.issueTrackerConfig.findFirst.mockResolvedValue(sampleConfig);
		mockTestConnection.mockResolvedValue({ ok: true, message: 'ok' });

		const event = createMockEvent({ method: 'POST', params: PARAMS, user: testUser, body: {} });
		await POST(event);

		expect(mockTestConnection).toHaveBeenCalledWith({
			provider: 'JIRA',
			baseUrl: 'https://company.atlassian.net',
			apiToken: 'user@test.com:token',
			projectKey: 'PROJ',
			customTemplate: null
		});
	});

	it('should return testConnection failure result', async () => {
		mockDb.query.issueTrackerConfig.findFirst.mockResolvedValue(sampleConfig);
		mockTestConnection.mockResolvedValue({ ok: false, message: 'Jira returned 401' });

		const event = createMockEvent({ method: 'POST', params: PARAMS, user: testUser, body: {} });

		const response = await POST(event);
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.ok).toBe(false);
		expect(body.message).toContain('401');
	});
});
