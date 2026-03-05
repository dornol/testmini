import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	notification: {
		id: 'id',
		userId: 'user_id',
		isRead: 'is_read'
	}
}));
vi.mock('drizzle-orm', () => ({
	and: vi.fn((...args: unknown[]) => args),
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	inArray: vi.fn((a: unknown, b: unknown) => ['inArray', a, b])
}));

// Import after mocks
const { POST } = await import('./+server');

describe('/api/notifications/read', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('POST', () => {
		it('should return 401 when not authenticated', async () => {
			const event = createMockEvent({ method: 'POST', body: { all: true }, user: null });
			await expect(POST(event)).rejects.toThrow();
		});

		it('should mark all as read with { all: true }', async () => {
			const updateChain = {
				set: vi.fn().mockReturnThis(),
				where: vi.fn().mockResolvedValue(undefined),
				then: (resolve: (v: unknown) => void) => Promise.resolve(undefined).then(resolve)
			};
			mockDb.update.mockReturnValue(updateChain as never);

			const event = createMockEvent({
				method: 'POST',
				body: { all: true },
				user: testUser
			});
			const response = await POST(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.ok).toBe(true);
			expect(mockDb.update).toHaveBeenCalled();
		});

		it('should mark specific IDs as read', async () => {
			const updateChain = {
				set: vi.fn().mockReturnThis(),
				where: vi.fn().mockResolvedValue(undefined),
				then: (resolve: (v: unknown) => void) => Promise.resolve(undefined).then(resolve)
			};
			mockDb.update.mockReturnValue(updateChain as never);

			const event = createMockEvent({
				method: 'POST',
				body: { ids: [1, 2, 3] },
				user: testUser
			});
			const response = await POST(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.ok).toBe(true);
			expect(mockDb.update).toHaveBeenCalled();
		});

		it('should return 400 for invalid body', async () => {
			const event = createMockEvent({
				method: 'POST',
				body: { something: 'unexpected' },
				user: testUser
			});

			await expect(POST(event)).rejects.toThrow();
			try {
				await POST(event);
			} catch (e: any) {
				expect(e.status).toBe(400);
			}
		});
	});
});
