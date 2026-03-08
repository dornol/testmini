import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';

const mockDb = createMockDb() as ReturnType<typeof createMockDb> & { execute: ReturnType<typeof vi.fn> };
const mockPing = vi.fn();
let mockRedis: { ping: typeof mockPing } | null = null;

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('drizzle-orm', () => ({
	sql: Object.assign(
		(strings: TemplateStringsArray, ...values: unknown[]) => ({
			as: () => ({ sql: strings, values })
		}),
		{ raw: (s: string) => s }
	)
}));
vi.mock('$lib/server/redis', () => ({
	get redis() {
		return mockRedis;
	}
}));

// Import after mocks
const { GET } = await import('./+server');

describe('/api/health', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockRedis = null;
	});

	describe('GET', () => {
		it('should return 200 with status ok when DB healthy and Redis not configured', async () => {
			mockDb.execute = vi.fn().mockResolvedValue([{ '?column?': 1 }]);

			const event = createMockEvent({ method: 'GET' });
			const response = await GET(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.status).toBe('ok');
			expect(data.components.database.status).toBe('healthy');
			expect(data.components.redis.status).toBe('not_configured');
			expect(data.components.redis.message).toBe('Using in-memory fallback');
		});

		it('should return 200 with all components healthy when both DB and Redis work', async () => {
			mockDb.execute = vi.fn().mockResolvedValue([{ '?column?': 1 }]);
			mockPing.mockResolvedValue('PONG');
			mockRedis = { ping: mockPing };

			const event = createMockEvent({ method: 'GET' });
			const response = await GET(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.status).toBe('ok');
			expect(data.components.database.status).toBe('healthy');
			expect(data.components.redis.status).toBe('healthy');
		});

		it('should return 503 with degraded when DB fails', async () => {
			mockDb.execute = vi.fn().mockRejectedValue(new Error('Connection refused'));

			const event = createMockEvent({ method: 'GET' });
			const response = await GET(event);
			const data = await response.json();

			expect(response.status).toBe(503);
			expect(data.status).toBe('degraded');
			expect(data.components.database.status).toBe('unhealthy');
			expect(data.components.database.message).toBe('Connection failed');
		});

		it('should return 200 when Redis fails but DB works', async () => {
			mockDb.execute = vi.fn().mockResolvedValue([{ '?column?': 1 }]);
			mockPing.mockRejectedValue(new Error('ECONNREFUSED'));
			mockRedis = { ping: mockPing };

			const event = createMockEvent({ method: 'GET' });
			const response = await GET(event);
			const data = await response.json();

			// Redis unhealthy makes overall status degraded (503)
			expect(response.status).toBe(503);
			expect(data.status).toBe('degraded');
			expect(data.components.database.status).toBe('healthy');
			expect(data.components.redis.status).toBe('unhealthy');
			expect(data.components.redis.message).toBe('Connection failed');
		});

		it('should include timestamp in response', async () => {
			mockDb.execute = vi.fn().mockResolvedValue([{ '?column?': 1 }]);

			const before = new Date().toISOString();
			const event = createMockEvent({ method: 'GET' });
			const response = await GET(event);
			const data = await response.json();
			const after = new Date().toISOString();

			expect(data.timestamp).toBeDefined();
			expect(data.timestamp >= before).toBe(true);
			expect(data.timestamp <= after).toBe(true);
		});

		it('should include components object with database and redis keys', async () => {
			mockDb.execute = vi.fn().mockResolvedValue([{ '?column?': 1 }]);

			const event = createMockEvent({ method: 'GET' });
			const response = await GET(event);
			const data = await response.json();

			expect(data.components).toBeDefined();
			expect(data.components).toHaveProperty('database');
			expect(data.components).toHaveProperty('redis');
			expect(data.components.database).toHaveProperty('status');
			expect(data.components.redis).toHaveProperty('status');
		});
	});
});
