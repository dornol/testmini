import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb, col: mockDb.col, sql: mockDb.sql }));
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

		it('should return 400 for non-positive notification IDs', async () => {
			const event = createMockEvent({
				method: 'POST',
				body: { ids: [0, -1] },
				user: testUser
			});

			await expect(POST(event)).rejects.toMatchObject({ status: 400 });
			expect(mockDb.update).not.toHaveBeenCalled();
		});

		it('should return 400 for invalid notification IDs before updating', async () => {
			for (const ids of [[1.5], ['1'], [Number.MAX_SAFE_INTEGER + 1]]) {
				vi.clearAllMocks();
				const event = createMockEvent({
					method: 'POST',
					body: { ids },
					user: testUser
				});

				await expect(POST(event)).rejects.toMatchObject({ status: 400 });
				expect(mockDb.update).not.toHaveBeenCalled();
			}
		});

		it('should return 400 when all and ids are combined', async () => {
			const event = createMockEvent({
				method: 'POST',
				body: { all: true, ids: [1] },
				user: testUser
			});

			await expect(POST(event)).rejects.toMatchObject({ status: 400 });
			expect(mockDb.update).not.toHaveBeenCalled();
		});

		it('should return 400 for unexpected fields before updating', async () => {
			const event = createMockEvent({
				method: 'POST',
				body: { ids: [1], scope: 'all' },
				user: testUser
			});

			await expect(POST(event)).rejects.toMatchObject({ status: 400 });
			expect(mockDb.update).not.toHaveBeenCalled();
		});

		it('should return 400 for too many notification IDs', async () => {
			const event = createMockEvent({
				method: 'POST',
				body: { ids: Array.from({ length: 101 }, (_, index) => index + 1) },
				user: testUser
			});

			await expect(POST(event)).rejects.toMatchObject({ status: 400 });
			expect(mockDb.update).not.toHaveBeenCalled();
		});
	});
});
