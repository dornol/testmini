import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockSelectResult } from '$lib/server/test-helpers/mock-db';

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

// We need selectDistinct support - add it to mockDb
mockDb.selectDistinct = vi.fn().mockReturnValue(mockDb._chains.select) as never;

const { load } = await import('./+page.server');

describe('admin/audit-logs +page.server', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Re-add selectDistinct after clearAllMocks
		mockDb.selectDistinct = vi.fn().mockReturnValue(mockDb._chains.select) as never;
	});

	describe('load', () => {
		it('should return logs with default pagination', async () => {
			const url = new URL('http://localhost:5173/admin/audit-logs');
			// First select call returns logs, second returns total count
			mockSelectResult(mockDb, []);

			const result = (await load({ url } as never)) as Record<string, unknown>;
			expect(result.logs).toBeDefined();
			expect(result.actions).toBeDefined();
			expect(result.filters).toMatchObject({
				userId: '',
				action: '',
				projectId: '',
				from: '',
				to: ''
			});
			expect(result.pagination).toMatchObject({
				page: 1,
				limit: 50
			});
		});

		it('should apply userId filter', async () => {
			const url = new URL('http://localhost:5173/admin/audit-logs?userId=user-1');
			mockSelectResult(mockDb, []);

			const result = (await load({ url } as never)) as Record<string, unknown>;
			expect((result.filters as Record<string, unknown>).userId).toBe('user-1');
			expect(mockDb.select).toHaveBeenCalled();
		});

		it('should apply action filter', async () => {
			const url = new URL('http://localhost:5173/admin/audit-logs?action=USER_APPROVED');
			mockSelectResult(mockDb, []);

			const result = (await load({ url } as never)) as Record<string, unknown>;
			expect((result.filters as Record<string, unknown>).action).toBe('USER_APPROVED');
		});

		it('should apply projectId filter', async () => {
			const url = new URL('http://localhost:5173/admin/audit-logs?projectId=5');
			mockSelectResult(mockDb, []);

			const result = (await load({ url } as never)) as Record<string, unknown>;
			expect((result.filters as Record<string, unknown>).projectId).toBe('5');
		});

		it('should apply date range filters', async () => {
			const url = new URL(
				'http://localhost:5173/admin/audit-logs?from=2025-01-01&to=2025-01-31'
			);
			mockSelectResult(mockDb, []);

			const result = (await load({ url } as never)) as Record<string, unknown>;
			expect((result.filters as Record<string, unknown>).from).toBe('2025-01-01');
			expect((result.filters as Record<string, unknown>).to).toBe('2025-01-31');
		});

		it('should handle page parameter', async () => {
			const url = new URL('http://localhost:5173/admin/audit-logs?page=3');
			mockSelectResult(mockDb, []);

			const result = (await load({ url } as never)) as Record<string, unknown>;
			expect((result.pagination as Record<string, unknown>).page).toBe(3);
		});

		it('should clamp page to minimum of 1', async () => {
			const url = new URL('http://localhost:5173/admin/audit-logs?page=-5');
			mockSelectResult(mockDb, []);

			const result = (await load({ url } as never)) as Record<string, unknown>;
			expect((result.pagination as Record<string, unknown>).page).toBe(1);
		});

		it('should ignore non-numeric projectId', async () => {
			const url = new URL('http://localhost:5173/admin/audit-logs?projectId=abc');
			mockSelectResult(mockDb, []);

			const result = (await load({ url } as never)) as Record<string, unknown>;
			expect((result.filters as Record<string, unknown>).projectId).toBe('');
		});
	});
});
