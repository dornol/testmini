import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('drizzle-orm', () => ({
	sql: Object.assign(
		(strings: TemplateStringsArray, ...values: unknown[]) => ({
			as: () => ({ sql: strings, values })
		}),
		{ raw: (s: string) => s }
	)
}));

// Import after mocks
const { GET } = await import('./+server');

describe('/api/health', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('GET', () => {
		it('should return 200 with status ok', async () => {
			mockDb.execute = vi.fn().mockResolvedValue([{ '?column?': 1 }]);

			const event = createMockEvent({ method: 'GET' });
			const response = await GET(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.status).toBe('ok');
		});

		it('should handle DB connection failure gracefully', async () => {
			mockDb.execute = vi.fn().mockRejectedValue(new Error('Connection refused'));

			const event = createMockEvent({ method: 'GET' });
			const response = await GET(event);
			const data = await response.json();

			expect(response.status).toBe(503);
			expect(data.status).toBe('error');
			expect(data.message).toBe('Database connection failed');
		});
	});
});
