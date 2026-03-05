import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockSelectResult } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser, adminUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	auditLog: {
		id: 'id',
		action: 'action',
		entityType: 'entity_type',
		entityId: 'entity_id',
		projectId: 'project_id',
		metadata: 'metadata',
		ipAddress: 'ip_address',
		createdAt: 'created_at',
		userId: 'user_id'
	},
	user: {
		id: 'id',
		name: 'name',
		email: 'email'
	}
}));
vi.mock('drizzle-orm', () => ({
	and: vi.fn((...args: unknown[]) => args),
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	gte: vi.fn((a: unknown, b: unknown) => ['gte', a, b]),
	lte: vi.fn((a: unknown, b: unknown) => ['lte', a, b]),
	count: vi.fn(() => 'count'),
	desc: vi.fn((a: unknown) => ['desc', a])
}));

// Import after mocks
const { GET } = await import('./+server');

describe('/api/admin/audit-logs', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('GET', () => {
		it('should return 401 when not authenticated', async () => {
			const event = createMockEvent({ method: 'GET', user: null });
			await expect(GET(event)).rejects.toThrow();
		});

		it('should return 403 for non-admin users', async () => {
			const event = createMockEvent({ method: 'GET', user: testUser });
			const response = await GET(event);

			expect(response.status).toBe(403);
			const data = await response.json();
			expect(data.error).toBe('Admin access required');
		});

		it('should return paginated audit logs for admin', async () => {
			const logs = [
				{
					id: 1,
					action: 'project.create',
					entityType: 'project',
					entityId: '1',
					projectId: 1,
					metadata: {},
					ipAddress: '127.0.0.1',
					createdAt: new Date('2025-01-01'),
					userId: 'user-1',
					userName: 'Test User',
					userEmail: 'test@example.com'
				}
			];

			// The handler uses Promise.all with two db.select() calls invoked synchronously.
			// mockReturnValueOnce queues distinct chains so the first call returns logs
			// and the second call returns the count row.
			const logsChain = mockSelectResult(mockDb, logs);
			mockDb.select.mockReturnValueOnce(logsChain as never);
			const countChain = mockSelectResult(mockDb, [{ total: 1 }]);
			mockDb.select.mockReturnValueOnce(countChain as never);

			const event = createMockEvent({ method: 'GET', user: adminUser });
			const response = await GET(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.data).toHaveLength(1);
			expect(data.data[0].action).toBe('project.create');
			expect(data.meta).toMatchObject({ page: 1, limit: 50 });
			expect(data.meta.total).toBe(1);
			expect(data.meta.totalPages).toBe(1);
		});

		it('should filter by action parameter', async () => {
			const logs = [
				{
					id: 2,
					action: 'user.login',
					entityType: 'user',
					entityId: 'user-1',
					projectId: null,
					metadata: {},
					ipAddress: '127.0.0.1',
					createdAt: new Date('2025-01-02'),
					userId: 'user-1',
					userName: 'Test User',
					userEmail: 'test@example.com'
				}
			];

			let callCount = 0;
			mockDb.select.mockImplementation(() => {
				callCount++;
				if (callCount % 2 === 0) {
					return mockSelectResult(mockDb, [{ total: 1 }]) as never;
				}
				return mockSelectResult(mockDb, logs) as never;
			});

			const event = createMockEvent({
				method: 'GET',
				user: adminUser,
				searchParams: { action: 'user.login' }
			});
			const response = await GET(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.data).toHaveLength(1);
			expect(data.data[0].action).toBe('user.login');
			expect(mockDb.select).toHaveBeenCalled();
		});

		it('should filter by date range (from/to)', async () => {
			let callCount = 0;
			mockDb.select.mockImplementation(() => {
				callCount++;
				if (callCount % 2 === 0) {
					return mockSelectResult(mockDb, [{ total: 0 }]) as never;
				}
				return mockSelectResult(mockDb, []) as never;
			});

			const event = createMockEvent({
				method: 'GET',
				user: adminUser,
				searchParams: { from: '2025-01-01', to: '2025-01-31' }
			});
			const response = await GET(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.data).toEqual([]);
			expect(data.meta).toMatchObject({ page: 1, total: 0 });
			expect(mockDb.select).toHaveBeenCalled();
		});
	});
});
