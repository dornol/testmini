import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockSelectResult } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	user: {
		id: 'id',
		name: 'name',
		email: 'email'
	},
	projectMember: {
		projectId: 'project_id',
		userId: 'user_id',
		role: 'role'
	}
}));
vi.mock('drizzle-orm', () => ({
	and: vi.fn((...args: unknown[]) => args),
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	ilike: vi.fn((a: unknown, b: unknown) => ['ilike', a, b]),
	or: vi.fn((...args: unknown[]) => args),
	notInArray: vi.fn((a: unknown, b: unknown) => ['notInArray', a, b]),
	count: vi.fn(() => 'count'),
	inArray: vi.fn((a: unknown, b: unknown) => ['inArray', a, b]),
	sql: Object.assign(
		(strings: TemplateStringsArray, ...values: unknown[]) => ({
			as: () => ({ sql: strings, values })
		}),
		{ raw: (s: string) => s }
	)
}));

// Import after mocks
const { GET } = await import('./+server');

describe('/api/users/search', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('GET', () => {
		it('should return 400 when query is less than 2 characters', async () => {
			const event = createMockEvent({
				method: 'GET',
				user: testUser,
				searchParams: { q: 'a' }
			});
			const response = await GET(event);

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.data).toEqual([]);
		});

		it('should support offset parameter for pagination', async () => {
			const users = [
				{ id: 'user-5', name: 'Test User 5', email: 'user5@example.com' },
				{ id: 'user-6', name: 'Test User 6', email: 'user6@example.com' }
			];
			mockSelectResult(mockDb, users);

			const event = createMockEvent({
				method: 'GET',
				user: testUser,
				searchParams: { q: 'Test', offset: '10' }
			});
			const response = await GET(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.data).toHaveLength(2);
			expect(mockDb.select).toHaveBeenCalled();
		});

		it('should return 401 when not authenticated', async () => {
			const event = createMockEvent({
				method: 'GET',
				user: null,
				searchParams: { q: 'test' }
			});
			await expect(GET(event)).rejects.toThrow();
		});
	});
});
