import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockSelectResult } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	notification: {
		id: 'id',
		userId: 'user_id',
		type: 'type',
		title: 'title',
		body: 'body',
		isRead: 'is_read',
		createdAt: 'created_at'
	}
}));
vi.mock('drizzle-orm', () => ({
	and: vi.fn((...args: unknown[]) => args),
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	lt: vi.fn((a: unknown, b: unknown) => ['lt', a, b]),
	desc: vi.fn((a: unknown) => ['desc', a])
}));

// Import after mocks
const { GET } = await import('./+server');

describe('/api/notifications', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('GET', () => {
		it('should return 401 when not authenticated', async () => {
			const event = createMockEvent({ method: 'GET', user: null });
			await expect(GET(event)).rejects.toThrow();
		});

		it('should return notifications for authenticated user', async () => {
			const notifications = [
				{
					id: 1,
					userId: 'user-1',
					type: 'mention',
					title: 'You were mentioned',
					body: 'Someone mentioned you',
					isRead: false,
					createdAt: new Date('2025-01-02')
				},
				{
					id: 2,
					userId: 'user-1',
					type: 'assignment',
					title: 'Test assigned to you',
					body: 'A test case was assigned to you',
					isRead: true,
					createdAt: new Date('2025-01-01')
				}
			];
			mockSelectResult(mockDb, notifications);

			const event = createMockEvent({ method: 'GET', user: testUser });
			const response = await GET(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.items).toHaveLength(2);
			expect(data.items[0].id).toBe(1);
			expect(data.hasMore).toBe(false);
			expect(data.nextCursor).toBeNull();
		});

		it('should filter unread only when unreadOnly=true', async () => {
			const unreadNotifications = [
				{
					id: 3,
					userId: 'user-1',
					type: 'mention',
					title: 'New mention',
					body: 'Someone mentioned you again',
					isRead: false,
					createdAt: new Date('2025-01-03')
				}
			];
			mockSelectResult(mockDb, unreadNotifications);

			const event = createMockEvent({
				method: 'GET',
				user: testUser,
				searchParams: { unreadOnly: 'true' }
			});
			const response = await GET(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.items).toHaveLength(1);
			expect(data.items[0].isRead).toBe(false);
			expect(mockDb.select).toHaveBeenCalled();
		});

		it('should respect limit parameter', async () => {
			// Return limit + 1 rows to simulate hasMore = true
			const notifications = Array.from({ length: 6 }, (_, i) => ({
				id: i + 1,
				userId: 'user-1',
				type: 'mention',
				title: `Notification ${i + 1}`,
				body: `Body ${i + 1}`,
				isRead: false,
				createdAt: new Date('2025-01-01')
			}));
			mockSelectResult(mockDb, notifications);

			const event = createMockEvent({
				method: 'GET',
				user: testUser,
				searchParams: { limit: '5' }
			});
			const response = await GET(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			// limit is 5, backend fetches limit+1=6, so hasMore should be true
			expect(data.items).toHaveLength(5);
			expect(data.hasMore).toBe(true);
			expect(data.nextCursor).toBe(String(notifications[4].id));
		});
	});
});
