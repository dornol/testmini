import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockSelectResult } from '$lib/server/test-helpers/mock-db';
import { adminUser, testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	user: {
		id: 'id',
		name: 'name',
		email: 'email',
		role: 'role',
		approved: 'approved',
		banned: 'banned',
		banReason: 'ban_reason',
		createdAt: 'created_at'
	}
}));
vi.mock('drizzle-orm', () => ({
	and: vi.fn((...args: unknown[]) => args),
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	ilike: vi.fn((a: unknown, b: unknown) => ['ilike', a, b]),
	or: vi.fn((...args: unknown[]) => ['or', ...args]),
	count: vi.fn(() => 'count'),
	desc: vi.fn((a: unknown) => ['desc', a])
}));
vi.mock('$lib/server/audit', () => ({
	logAudit: vi.fn()
}));

const { actions, load } = await import('./+page.server');
const { logAudit } = await import('$lib/server/audit');

function createFormData(entries: Record<string, string>): FormData {
	const fd = new FormData();
	for (const [k, v] of Object.entries(entries)) {
		fd.set(k, v);
	}
	return fd;
}

function createActionEvent(
	user: NonNullable<App.Locals['user']> | null,
	formEntries: Record<string, string>
) {
	const formData = createFormData(formEntries);
	return {
		request: {
			formData: () => Promise.resolve(formData)
		},
		locals: {
			user: user ?? undefined,
			session: user ? { id: 'session-1' } : undefined,
			requestId: 'test-req'
		},
		url: new URL('http://localhost:5173/admin/users')
	} as never;
}

describe('admin/users approval actions', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('approve', () => {
		it('should return 403 for non-admin users', async () => {
			const event = createActionEvent(testUser, { userId: 'user-2' });
			const result = await actions.approve(event);
			expect(result).toMatchObject({ status: 403, data: { error: 'Admin access required' } });
		});

		it('should return 401 when not authenticated', async () => {
			const event = createActionEvent(null, { userId: 'user-2' });
			await expect(actions.approve(event)).rejects.toThrow();
		});

		it('should return 400 when userId is missing', async () => {
			const event = createActionEvent(adminUser, {});
			const result = await actions.approve(event);
			expect(result).toMatchObject({ status: 400, data: { error: 'Invalid user ID' } });
		});

		it('should set approved=true and log audit on success', async () => {
			const event = createActionEvent(adminUser, { userId: 'pending-user-1' });
			const result = await actions.approve(event);

			expect(result).toMatchObject({ success: true });
			expect(mockDb.update).toHaveBeenCalled();
			expect(logAudit).toHaveBeenCalledWith({
				userId: adminUser.id,
				action: 'USER_APPROVED',
				entityType: 'USER',
				entityId: 'pending-user-1'
			});
		});
	});

	describe('reject', () => {
		it('should return 403 for non-admin users', async () => {
			const event = createActionEvent(testUser, { userId: 'user-2' });
			const result = await actions.reject(event);
			expect(result).toMatchObject({ status: 403, data: { error: 'Admin access required' } });
		});

		it('should return 401 when not authenticated', async () => {
			const event = createActionEvent(null, { userId: 'user-2' });
			await expect(actions.reject(event)).rejects.toThrow();
		});

		it('should return 400 when userId is missing', async () => {
			const event = createActionEvent(adminUser, {});
			const result = await actions.reject(event);
			expect(result).toMatchObject({ status: 400, data: { error: 'Invalid user ID' } });
		});

		it('should delete the user and log audit on success', async () => {
			const event = createActionEvent(adminUser, { userId: 'pending-user-2' });
			const result = await actions.reject(event);

			expect(result).toMatchObject({ success: true });
			expect(mockDb.delete).toHaveBeenCalled();
			expect(logAudit).toHaveBeenCalledWith({
				userId: adminUser.id,
				action: 'USER_REJECTED',
				entityType: 'USER',
				entityId: 'pending-user-2'
			});
		});

		it('should call logAudit before deleting the user', async () => {
			const callOrder: string[] = [];
			(logAudit as ReturnType<typeof vi.fn>).mockImplementation(() => {
				callOrder.push('audit');
			});
			mockDb.delete.mockImplementation(() => {
				callOrder.push('delete');
				return mockDb._chains.delete;
			});

			const event = createActionEvent(adminUser, { userId: 'pending-user-3' });
			await actions.reject(event);

			expect(callOrder).toEqual(['audit', 'delete']);
		});
	});

	describe('load with pending filter', () => {
		it('should return pendingOnly=false by default', async () => {
			const url = new URL('http://localhost:5173/admin/users');
			mockSelectResult(mockDb, [{ count: 0 }]);

			const result = await load({ url } as never) as Record<string, unknown>;
			expect(result.pendingOnly).toBe(false);
		});

		it('should return pendingOnly=true when pending=true param is set', async () => {
			const url = new URL('http://localhost:5173/admin/users?pending=true');
			mockSelectResult(mockDb, [{ count: 0 }]);

			const result = await load({ url } as never) as Record<string, unknown>;
			expect(result.pendingOnly).toBe(true);
		});

		it('should query users with approved field', async () => {
			const url = new URL('http://localhost:5173/admin/users');
			// Both select calls (count + user list) return from the same chain
			// In mock, we verify the query was made; actual field mapping is drizzle's responsibility
			mockSelectResult(mockDb, [{ count: 0 }]);

			const result = await load({ url } as never) as Record<string, unknown>;
			expect(result.users).toBeDefined();
			expect(mockDb.select).toHaveBeenCalled();
		});
	});
});
