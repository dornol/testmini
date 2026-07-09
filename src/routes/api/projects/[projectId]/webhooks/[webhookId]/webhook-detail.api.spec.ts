import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	createMockDb,
	mockDeleteReturning,
	mockUpdateReturning
} from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser, adminUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();
const mockLookup = vi.fn();

vi.mock('$lib/server/db', () => ({ db: mockDb, col: mockDb.col, sql: mockDb.sql }));
vi.mock('dns/promises', () => ({
	lookup: mockLookup
}));
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
	const actual =
		await vi.importActual<typeof import('$lib/server/auth-utils')>('$lib/server/auth-utils');
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
		mockLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
		vi.mocked(authUtils.requireProjectRole).mockResolvedValue({ role: 'PROJECT_ADMIN' });
		// Add projectWebhook to query mock
		mockDb.query.projectWebhook = { findFirst: vi.fn() };
		mockUpdateReturning(mockDb, [existingWebhook]);
	});

	describe('PATCH', () => {
		it('should update webhook name', async () => {
			mockDb.query.projectWebhook.findFirst.mockResolvedValueOnce(existingWebhook);
			mockUpdateReturning(mockDb, [{ ...existingWebhook, name: 'Updated Name' }]);

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
			const updateChain = mockDb.update.mock.results[0]?.value as {
				where: ReturnType<typeof vi.fn>;
				returning: ReturnType<typeof vi.fn>;
			};
			expect(updateChain.where).toHaveBeenCalledWith(
				expect.arrayContaining([
					['id', 5],
					['project_id', 1]
				])
			);
			expect(updateChain.returning).toHaveBeenCalled();
		});

		it('should update webhook URL', async () => {
			mockDb.query.projectWebhook.findFirst.mockResolvedValueOnce(existingWebhook);
			mockUpdateReturning(mockDb, [{ ...existingWebhook, url: 'https://new.example.com/hook' }]);

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
			mockDb.query.projectWebhook.findFirst.mockResolvedValueOnce(existingWebhook);
			mockUpdateReturning(mockDb, [{ ...existingWebhook, enabled: false }]);

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
			mockDb.query.projectWebhook.findFirst.mockResolvedValueOnce(existingWebhook);
			mockUpdateReturning(mockDb, [
				{ ...existingWebhook, events: ['TEST_FAILED', 'COMMENT_ADDED'] }
			]);

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

		it('should return 404 when webhook disappears before update', async () => {
			mockDb.query.projectWebhook.findFirst.mockResolvedValueOnce(existingWebhook);
			mockUpdateReturning(mockDb, []);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { name: 'Updated' },
				user: adminUser
			});

			await expect(PATCH(event)).rejects.toMatchObject({ status: 404 });
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
			expect(mockDb.query.projectWebhook.findFirst).not.toHaveBeenCalled();
			expect(mockDb.update).not.toHaveBeenCalled();
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
			expect(mockDb.query.projectWebhook.findFirst).not.toHaveBeenCalled();
			expect(mockDb.update).not.toHaveBeenCalled();
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
			expect(mockDb.query.projectWebhook.findFirst).not.toHaveBeenCalled();
			expect(mockDb.update).not.toHaveBeenCalled();
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
			expect(mockDb.query.projectWebhook.findFirst).not.toHaveBeenCalled();
			expect(mockDb.update).not.toHaveBeenCalled();
		});

		it('should return 400 when URL resolves to a private address', async () => {
			mockDb.query.projectWebhook.findFirst.mockResolvedValue(existingWebhook);
			mockLookup.mockResolvedValue([{ address: '10.0.0.10', family: 4 }]);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { url: 'https://internal.example/hook' },
				user: adminUser
			});
			const response = await PATCH(event);

			expect(response.status).toBe(400);
			const data = await response.json();
			expect(data.error).toContain('private or reserved IP');
			expect(mockDb.query.projectWebhook.findFirst).not.toHaveBeenCalled();
			expect(mockDb.update).not.toHaveBeenCalled();
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
			expect(mockDb.query.projectWebhook.findFirst).not.toHaveBeenCalled();
			expect(mockDb.update).not.toHaveBeenCalled();
		});

		it('should return 400 when events contain duplicates', async () => {
			mockDb.query.projectWebhook.findFirst.mockResolvedValue(existingWebhook);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { events: ['TEST_FAILED', 'TEST_FAILED'] },
				user: adminUser
			});
			const response = await PATCH(event);

			expect(response.status).toBe(400);
			expect((await response.json()).error).toContain('Duplicate event type');
			expect(mockDb.query.projectWebhook.findFirst).not.toHaveBeenCalled();
			expect(mockDb.update).not.toHaveBeenCalled();
		});

		it('should return 400 when events exceeds maximum length', async () => {
			mockDb.query.projectWebhook.findFirst.mockResolvedValue(existingWebhook);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: {
					events: [
						'TEST_RUN_COMPLETED',
						'TEST_FAILED',
						'COMMENT_ADDED',
						'MEMBER_ADDED',
						'ASSIGNED',
						'TEST_FAILED'
					]
				},
				user: adminUser
			});
			const response = await PATCH(event);

			expect(response.status).toBe(400);
			expect((await response.json()).error).toContain('Events must include 5 items or less');
			expect(mockDb.query.projectWebhook.findFirst).not.toHaveBeenCalled();
			expect(mockDb.update).not.toHaveBeenCalled();
		});

		it('should return 400 when request body is not an object', async () => {
			mockDb.query.projectWebhook.findFirst.mockResolvedValue(existingWebhook);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: null,
				user: adminUser
			});

			await expect(PATCH(event)).rejects.toMatchObject({ status: 400 });
			expect(mockDb.query.projectWebhook.findFirst).not.toHaveBeenCalled();
			expect(mockDb.update).not.toHaveBeenCalled();
		});

		it('should return 400 for unknown fields before updating', async () => {
			mockDb.query.projectWebhook.findFirst.mockResolvedValue(existingWebhook);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { name: 'Updated', retryPolicy: 'aggressive' },
				user: adminUser
			});

			const response = await PATCH(event);

			expect(response.status).toBe(400);
			expect((await response.json()).error).toContain('Invalid webhook field');
			expect(mockDb.query.projectWebhook.findFirst).not.toHaveBeenCalled();
			expect(mockDb.update).not.toHaveBeenCalled();
		});

		it('should return 400 when patch field types are invalid', async () => {
			const cases = [
				{ name: 123 },
				{ url: 123 },
				{ secret: 123 },
				{ enabled: 'false' },
				{ events: 'TEST_FAILED' },
				{ events: [123] }
			];

			for (const body of cases) {
				vi.clearAllMocks();
				mockLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
				vi.mocked(authUtils.requireProjectRole).mockResolvedValue({ role: 'PROJECT_ADMIN' });
				mockDb.query.projectWebhook = {
					findFirst: vi.fn().mockResolvedValue(existingWebhook)
				};

				const event = createMockEvent({
					method: 'PATCH',
					params: PARAMS,
					body,
					user: adminUser
				});

				const response = await PATCH(event);

				expect(response.status).toBe(400);
				expect(mockDb.query.projectWebhook.findFirst).not.toHaveBeenCalled();
				expect(mockDb.update).not.toHaveBeenCalled();
			}
		});

		it('should return 400 when secret exceeds maximum length', async () => {
			mockDb.query.projectWebhook.findFirst.mockResolvedValue(existingWebhook);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { secret: 's'.repeat(4001) },
				user: adminUser
			});

			const response = await PATCH(event);

			expect(response.status).toBe(400);
			expect((await response.json()).error).toContain('Secret must be 4000 characters or less');
			expect(mockDb.query.projectWebhook.findFirst).not.toHaveBeenCalled();
			expect(mockDb.update).not.toHaveBeenCalled();
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
			mockDb.query.projectWebhook.findFirst.mockResolvedValueOnce({
				...existingWebhook,
				secret: 'old-secret'
			});
			mockUpdateReturning(mockDb, [{ ...existingWebhook, secret: null }]);

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
			expect(mockDb.query.projectWebhook.findFirst).not.toHaveBeenCalled();
			expect(mockDb.update).not.toHaveBeenCalled();
		});
	});

	describe('DELETE', () => {
		it('should delete an existing webhook', async () => {
			mockDb.query.projectWebhook.findFirst.mockResolvedValue(existingWebhook);
			const deleteChain = mockDeleteReturning(mockDb, [existingWebhook]);

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
			expect(deleteChain.where).toHaveBeenCalledWith(
				expect.arrayContaining([
					['id', 5],
					['project_id', 1]
				])
			);
		});

		it('should return 404 when webhook disappears before delete', async () => {
			mockDb.query.projectWebhook.findFirst.mockResolvedValue(existingWebhook);
			mockDeleteReturning(mockDb, []);

			const event = createMockEvent({
				method: 'DELETE',
				params: PARAMS,
				user: adminUser
			});

			await expect(DELETE(event)).rejects.toMatchObject({ status: 404 });
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
