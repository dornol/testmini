import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser, adminUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	projectWebhook: {
		id: 'id',
		projectId: 'project_id',
		name: 'name',
		url: 'url',
		secret: 'secret',
		events: 'events',
		enabled: 'enabled',
		createdBy: 'created_by',
		createdAt: 'created_at'
	}
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	and: vi.fn((...args: unknown[]) => args)
}));

const mockSendProjectWebhooks = vi.fn();
vi.mock('$lib/server/webhooks', () => ({
	sendProjectWebhooks: mockSendProjectWebhooks
}));

vi.mock('$lib/server/auth-utils', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/auth-utils')>('$lib/server/auth-utils');
	return {
		...actual,
		requireProjectRole: vi.fn().mockResolvedValue({ role: 'PROJECT_ADMIN' })
	};
});

const { POST } = await import('./+server');
const authUtils = await import('$lib/server/auth-utils');

const PARAMS = { projectId: '1', webhookId: '5' };

const existingWebhook = {
	id: 5,
	projectId: 1,
	name: 'Test Hook',
	url: 'https://example.com/hook',
	secret: null,
	events: [],
	enabled: true,
	createdBy: 'user-1',
	createdAt: new Date()
};

describe('/api/projects/[projectId]/webhooks/[webhookId]/test', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(authUtils.requireProjectRole).mockResolvedValue({ role: 'PROJECT_ADMIN' });
		mockDb.query.projectWebhook = { findFirst: vi.fn() };
	});

	it('should send a test webhook and return success', async () => {
		mockDb.query.projectWebhook.findFirst.mockResolvedValue(existingWebhook);

		const event = createMockEvent({
			method: 'POST',
			params: PARAMS,
			body: {},
			user: adminUser
		});
		const response = await POST(event);
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.success).toBe(true);
		expect(mockSendProjectWebhooks).toHaveBeenCalledWith(1, 'TEST', {
			title: 'Test webhook',
			message: 'This is a test notification from testmini.'
		});
	});

	it('should return 404 when webhook does not exist', async () => {
		mockDb.query.projectWebhook.findFirst.mockResolvedValue(null);

		const event = createMockEvent({
			method: 'POST',
			params: PARAMS,
			body: {},
			user: adminUser
		});
		await expect(POST(event)).rejects.toThrow();
	});

	it('should return 403 for non-admin', async () => {
		vi.mocked(authUtils.requireProjectRole).mockRejectedValue(
			Object.assign(new Error(), { status: 403, body: { message: 'Forbidden' } })
		);

		const event = createMockEvent({
			method: 'POST',
			params: PARAMS,
			body: {},
			user: testUser
		});
		await expect(POST(event)).rejects.toThrow();
	});

	it('should return 401 when unauthenticated', async () => {
		const event = createMockEvent({
			method: 'POST',
			params: PARAMS,
			body: {},
			user: null
		});
		await expect(POST(event)).rejects.toThrow();
	});
});
