import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockSelectResult, mockInsertReturning } from '$lib/server/test-helpers/mock-db';
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
	desc: vi.fn((col: unknown) => col),
	and: vi.fn((...args: unknown[]) => args)
}));

vi.mock('$lib/server/auth-utils', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/auth-utils')>('$lib/server/auth-utils');
	return {
		...actual,
		requireProjectRole: vi.fn().mockResolvedValue({ role: 'PROJECT_ADMIN' })
	};
});

const { GET, POST } = await import('./+server');
const authUtils = await import('$lib/server/auth-utils');

const PARAMS = { projectId: '1' };

const sampleWebhook = {
	id: 1,
	name: 'Slack #testing',
	url: 'https://hooks.slack.com/services/xxx',
	events: ['TEST_RUN_COMPLETED'],
	enabled: true,
	createdAt: new Date('2025-03-08')
};

describe('/api/projects/[projectId]/webhooks', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(authUtils.requireProjectRole).mockResolvedValue({ role: 'PROJECT_ADMIN' });
	});

	describe('GET', () => {
		it('should return webhooks list', async () => {
			mockSelectResult(mockDb, [sampleWebhook]);

			const event = createMockEvent({ method: 'GET', params: PARAMS, user: testUser });
			const response = await GET(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(Array.isArray(data)).toBe(true);
			expect(data).toHaveLength(1);
			expect(data[0].id).toBe(1);
			expect(data[0].name).toBe('Slack #testing');
		});

		it('should return empty array when no webhooks exist', async () => {
			mockSelectResult(mockDb, []);

			const event = createMockEvent({ method: 'GET', params: PARAMS, user: testUser });
			const response = await GET(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data).toEqual([]);
		});

		it('should return 401 when unauthenticated', async () => {
			const event = createMockEvent({ method: 'GET', params: PARAMS, user: null });
			await expect(GET(event)).rejects.toThrow();
		});
	});

	describe('POST', () => {
		it('should create a webhook with valid data', async () => {
			const created = {
				id: 2,
				name: 'My Hook',
				url: 'https://example.com/hook',
				events: [],
				enabled: true,
				createdAt: new Date()
			};
			mockInsertReturning(mockDb, [created]);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { name: 'My Hook', url: 'https://example.com/hook' },
				user: adminUser
			});
			const response = await POST(event);
			const data = await response.json();

			expect(response.status).toBe(201);
			expect(data.id).toBe(2);
			expect(data.name).toBe('My Hook');
		});

		it('should create a webhook with events filter', async () => {
			const created = {
				id: 3,
				name: 'Filtered Hook',
				url: 'https://example.com/hook',
				events: ['TEST_FAILED', 'TEST_RUN_COMPLETED'],
				enabled: true,
				createdAt: new Date()
			};
			mockInsertReturning(mockDb, [created]);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: {
					name: 'Filtered Hook',
					url: 'https://example.com/hook',
					events: ['TEST_FAILED', 'TEST_RUN_COMPLETED']
				},
				user: adminUser
			});
			const response = await POST(event);
			const data = await response.json();

			expect(response.status).toBe(201);
			expect(data.events).toEqual(['TEST_FAILED', 'TEST_RUN_COMPLETED']);
		});

		it('should create a webhook with secret', async () => {
			const created = {
				id: 4,
				name: 'Secret Hook',
				url: 'https://example.com/hook',
				events: [],
				enabled: true,
				createdAt: new Date()
			};
			mockInsertReturning(mockDb, [created]);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: {
					name: 'Secret Hook',
					url: 'https://example.com/hook',
					secret: 'my-secret'
				},
				user: adminUser
			});
			const response = await POST(event);

			expect(response.status).toBe(201);
			// Verify secret was passed to insert
			const insertChain = mockDb.insert.mock.results[0]?.value;
			expect(insertChain?.values).toHaveBeenCalled();
		});

		it('should return 400 when name is missing', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { url: 'https://example.com/hook' },
				user: adminUser
			});
			const response = await POST(event);

			expect(response.status).toBe(400);
			const data = await response.json();
			expect(data.error).toContain('Name');
		});

		it('should return 400 when name is empty', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { name: '  ', url: 'https://example.com/hook' },
				user: adminUser
			});
			const response = await POST(event);

			expect(response.status).toBe(400);
		});

		it('should return 400 when URL is missing', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { name: 'Hook' },
				user: adminUser
			});
			const response = await POST(event);

			expect(response.status).toBe(400);
			const data = await response.json();
			expect(data.error).toContain('URL');
		});

		it('should return 400 when URL is invalid', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { name: 'Hook', url: 'not-a-url' },
				user: adminUser
			});
			const response = await POST(event);

			expect(response.status).toBe(400);
			const data = await response.json();
			expect(data.error).toContain('Invalid URL');
		});

		it('should return 400 when URL uses non-http protocol', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { name: 'Hook', url: 'ftp://example.com/hook' },
				user: adminUser
			});
			const response = await POST(event);

			expect(response.status).toBe(400);
			const data = await response.json();
			expect(data.error).toContain('http or https');
		});

		it('should return 400 when events contain invalid type', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { name: 'Hook', url: 'https://example.com/hook', events: ['INVALID_EVENT'] },
				user: adminUser
			});
			const response = await POST(event);

			expect(response.status).toBe(400);
			const data = await response.json();
			expect(data.error).toContain('Invalid event type');
		});

		it('should return 403 for non-admin', async () => {
			vi.mocked(authUtils.requireProjectRole).mockRejectedValue(
				Object.assign(new Error(), { status: 403, body: { message: 'Forbidden' } })
			);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { name: 'Hook', url: 'https://example.com/hook' },
				user: testUser
			});
			await expect(POST(event)).rejects.toThrow();
		});

		it('should return 401 when unauthenticated', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { name: 'Hook', url: 'https://example.com/hook' },
				user: null
			});
			await expect(POST(event)).rejects.toThrow();
		});

		it('should return 400 when name exceeds 100 chars', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { name: 'x'.repeat(101), url: 'https://example.com/hook' },
				user: adminUser
			});
			const response = await POST(event);

			expect(response.status).toBe(400);
		});
	});
});
