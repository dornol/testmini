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

vi.mock('$lib/server/auth-utils', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/auth-utils')>('$lib/server/auth-utils');
	return {
		...actual,
		requireProjectRole: vi.fn().mockResolvedValue({ role: 'PROJECT_ADMIN' })
	};
});

const { PATCH, DELETE } = await import('./+server');
const authUtils = await import('$lib/server/auth-utils');

const PARAMS = { projectId: '1', webhookId: '5' };

const existingWebhook = {
	id: 5,
	projectId: 1,
	name: 'Slack #testing',
	url: 'https://hooks.slack.com/services/xxx',
	secret: null,
	events: ['TEST_RUN_COMPLETED'],
	enabled: true,
	createdBy: 'user-1',
	createdAt: new Date('2025-03-08')
};

describe('/api/projects/[projectId]/webhooks/[webhookId]', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(authUtils.requireProjectRole).mockResolvedValue({ role: 'PROJECT_ADMIN' });
		// Add projectWebhook to query mock
		mockDb.query.projectWebhook = { findFirst: vi.fn() };
	});

	describe('PATCH', () => {
		it('should update webhook name', async () => {
			mockDb.query.projectWebhook.findFirst
				.mockResolvedValueOnce(existingWebhook) // existence check
				.mockResolvedValueOnce({ ...existingWebhook, name: 'Updated Name' }); // re-fetch after update

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { name: 'Updated Name' },
				user: adminUser
			});
			const response = await PATCH(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.name).toBe('Updated Name');
		});

		it('should update webhook URL', async () => {
			mockDb.query.projectWebhook.findFirst
				.mockResolvedValueOnce(existingWebhook)
				.mockResolvedValueOnce({ ...existingWebhook, url: 'https://new.example.com/hook' });

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { url: 'https://new.example.com/hook' },
				user: adminUser
			});
			const response = await PATCH(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.url).toBe('https://new.example.com/hook');
		});

		it('should update enabled status', async () => {
			mockDb.query.projectWebhook.findFirst
				.mockResolvedValueOnce(existingWebhook)
				.mockResolvedValueOnce({ ...existingWebhook, enabled: false });

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { enabled: false },
				user: adminUser
			});
			const response = await PATCH(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.enabled).toBe(false);
		});

		it('should update events filter', async () => {
			mockDb.query.projectWebhook.findFirst
				.mockResolvedValueOnce(existingWebhook)
				.mockResolvedValueOnce({ ...existingWebhook, events: ['TEST_FAILED', 'COMMENT_ADDED'] });

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { events: ['TEST_FAILED', 'COMMENT_ADDED'] },
				user: adminUser
			});
			const response = await PATCH(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.events).toEqual(['TEST_FAILED', 'COMMENT_ADDED']);
		});

		it('should return 404 when webhook does not exist', async () => {
			mockDb.query.projectWebhook.findFirst.mockResolvedValue(null);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { name: 'Updated' },
				user: adminUser
			});
			await expect(PATCH(event)).rejects.toThrow();
		});

		it('should return 400 when no fields to update', async () => {
			mockDb.query.projectWebhook.findFirst.mockResolvedValue(existingWebhook);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: {},
				user: adminUser
			});
			const response = await PATCH(event);

			expect(response.status).toBe(400);
			const data = await response.json();
			expect(data.error).toContain('No fields');
		});

		it('should return 400 when name is empty', async () => {
			mockDb.query.projectWebhook.findFirst.mockResolvedValue(existingWebhook);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { name: '  ' },
				user: adminUser
			});
			const response = await PATCH(event);

			expect(response.status).toBe(400);
		});

		it('should return 400 when URL is invalid', async () => {
			mockDb.query.projectWebhook.findFirst.mockResolvedValue(existingWebhook);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { url: 'not-a-url' },
				user: adminUser
			});
			const response = await PATCH(event);

			expect(response.status).toBe(400);
		});

		it('should return 400 when URL uses non-http protocol', async () => {
			mockDb.query.projectWebhook.findFirst.mockResolvedValue(existingWebhook);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { url: 'ftp://example.com' },
				user: adminUser
			});
			const response = await PATCH(event);

			expect(response.status).toBe(400);
		});

		it('should return 400 when events contain invalid type', async () => {
			mockDb.query.projectWebhook.findFirst.mockResolvedValue(existingWebhook);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { events: ['INVALID_EVENT'] },
				user: adminUser
			});
			const response = await PATCH(event);

			expect(response.status).toBe(400);
			const data = await response.json();
			expect(data.error).toContain('Invalid event type');
		});

		it('should return 403 for non-admin', async () => {
			vi.mocked(authUtils.requireProjectRole).mockRejectedValue(
				Object.assign(new Error(), { status: 403, body: { message: 'Forbidden' } })
			);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { name: 'Updated' },
				user: testUser
			});
			await expect(PATCH(event)).rejects.toThrow();
		});

		it('should return 401 when unauthenticated', async () => {
			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { name: 'Updated' },
				user: null
			});
			await expect(PATCH(event)).rejects.toThrow();
		});

		it('should clear secret when empty string is provided', async () => {
			mockDb.query.projectWebhook.findFirst
				.mockResolvedValueOnce({ ...existingWebhook, secret: 'old-secret' })
				.mockResolvedValueOnce({ ...existingWebhook, secret: null });

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { secret: '' },
				user: adminUser
			});
			const response = await PATCH(event);

			expect(response.status).toBe(200);
		});

		it('should return 400 when name exceeds 100 chars', async () => {
			mockDb.query.projectWebhook.findFirst.mockResolvedValue(existingWebhook);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { name: 'x'.repeat(101) },
				user: adminUser
			});
			const response = await PATCH(event);

			expect(response.status).toBe(400);
		});
	});

	describe('DELETE', () => {
		it('should delete an existing webhook', async () => {
			mockDb.query.projectWebhook.findFirst.mockResolvedValue(existingWebhook);

			const event = createMockEvent({
				method: 'DELETE',
				params: PARAMS,
				user: adminUser
			});
			const response = await DELETE(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.success).toBe(true);
			expect(mockDb.delete).toHaveBeenCalled();
		});

		it('should return 404 when webhook does not exist', async () => {
			mockDb.query.projectWebhook.findFirst.mockResolvedValue(null);

			const event = createMockEvent({
				method: 'DELETE',
				params: PARAMS,
				user: adminUser
			});
			await expect(DELETE(event)).rejects.toThrow();
		});

		it('should return 403 for non-admin', async () => {
			vi.mocked(authUtils.requireProjectRole).mockRejectedValue(
				Object.assign(new Error(), { status: 403, body: { message: 'Forbidden' } })
			);

			const event = createMockEvent({
				method: 'DELETE',
				params: PARAMS,
				user: testUser
			});
			await expect(DELETE(event)).rejects.toThrow();
		});

		it('should return 401 when unauthenticated', async () => {
			const event = createMockEvent({
				method: 'DELETE',
				params: PARAMS,
				user: null
			});
			await expect(DELETE(event)).rejects.toThrow();
		});
	});
});
