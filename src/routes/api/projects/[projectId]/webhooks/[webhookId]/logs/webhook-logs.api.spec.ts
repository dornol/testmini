import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockSelectResult } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser, adminUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	projectWebhook: { id: 'id', projectId: 'project_id' },
	webhookDeliveryLog: {
		id: 'id', webhookId: 'webhook_id', event: 'event', statusCode: 'status_code',
		success: 'success', errorMessage: 'error_message', attempt: 'attempt',
		duration: 'duration', createdAt: 'created_at'
	}
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	and: vi.fn((...args: unknown[]) => args),
	desc: vi.fn((a: unknown) => ['desc', a])
}));
vi.mock('$lib/server/auth-utils', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/auth-utils')>('$lib/server/auth-utils');
	return {
		...actual,
		requireProjectRole: vi.fn().mockResolvedValue({ role: 'PROJECT_ADMIN' })
	};
});

const { GET } = await import('./+server');
const authUtils = await import('$lib/server/auth-utils');

const PARAMS = { projectId: '1', webhookId: '5' };

const sampleLogs = [
	{
		id: 1, event: 'TEST_RUN_COMPLETED', statusCode: 200, success: true,
		errorMessage: null, attempt: 1, duration: 120, createdAt: new Date('2025-03-01')
	},
	{
		id: 2, event: 'TEST_CASE_CREATED', statusCode: 500, success: false,
		errorMessage: 'Internal Server Error', attempt: 1, duration: 3000, createdAt: new Date('2025-03-02')
	}
];

describe('/api/projects/[projectId]/webhooks/[webhookId]/logs', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(authUtils.requireProjectRole).mockResolvedValue({ role: 'PROJECT_ADMIN' });
		mockDb.query.projectWebhook = { findFirst: vi.fn() };
	});

	describe('GET', () => {
		it('should return 401 when not authenticated', async () => {
			const event = createMockEvent({ params: PARAMS, user: null });
			await expect(GET(event)).rejects.toThrow();
		});

		it('should return 404 when webhook not found', async () => {
			(mockDb.query.projectWebhook.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
			const event = createMockEvent({ params: PARAMS, user: adminUser });
			await expect(GET(event)).rejects.toThrow();
		});

		it('should return delivery logs on success', async () => {
			(mockDb.query.projectWebhook.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
				id: 5, projectId: 1
			});
			mockSelectResult(mockDb, sampleLogs);

			const event = createMockEvent({ params: PARAMS, user: adminUser });
			const response = await GET(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data).toHaveLength(2);
			expect(data[0].event).toBe('TEST_RUN_COMPLETED');
		});

		it('should respect limit search param', async () => {
			(mockDb.query.projectWebhook.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
				id: 5, projectId: 1
			});
			mockSelectResult(mockDb, [sampleLogs[0]]);

			const event = createMockEvent({
				params: PARAMS, user: adminUser, searchParams: { limit: '1' }
			});
			const response = await GET(event);
			expect(response.status).toBe(200);
		});

		it('should return empty array when no logs exist', async () => {
			(mockDb.query.projectWebhook.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
				id: 5, projectId: 1
			});
			mockSelectResult(mockDb, []);

			const event = createMockEvent({ params: PARAMS, user: adminUser });
			const response = await GET(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data).toHaveLength(0);
		});
	});
});
