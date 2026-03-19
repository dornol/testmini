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

describe('admin/users +page.server', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('load', () => {
		it('should return users with default pagination', async () => {
			const url = new URL('http://localhost:5173/admin/users');
			mockSelectResult(mockDb, [{ count: 5 }]);

			const result = (await load({ url } as never)) as Record<string, unknown>;
			expect(result.users).toBeDefined();
			expect(result.search).toBe('');
			expect(result.pendingOnly).toBe(false);
			expect(result.pagination).toMatchObject({
				page: 1,
				limit: 20,
				total: 5,
				totalPages: 1
			});
		});

		it('should apply search filter', async () => {
			const url = new URL('http://localhost:5173/admin/users?search=john');
			mockSelectResult(mockDb, [{ count: 1 }]);

			const result = (await load({ url } as never)) as Record<string, unknown>;
			expect(result.search).toBe('john');
			expect(mockDb.select).toHaveBeenCalled();
		});

		it('should apply pending filter', async () => {
			const url = new URL('http://localhost:5173/admin/users?pending=true');
			mockSelectResult(mockDb, [{ count: 0 }]);

			const result = (await load({ url } as never)) as Record<string, unknown>;
			expect(result.pendingOnly).toBe(true);
		});

		it('should handle page parameter', async () => {
			const url = new URL('http://localhost:5173/admin/users?page=3');
			mockSelectResult(mockDb, [{ count: 100 }]);

			const result = (await load({ url } as never)) as Record<string, unknown>;
			expect((result.pagination as Record<string, unknown>).page).toBe(3);
			expect((result.pagination as Record<string, unknown>).totalPages).toBe(5);
		});

		it('should clamp page to minimum of 1', async () => {
			const url = new URL('http://localhost:5173/admin/users?page=-1');
			mockSelectResult(mockDb, [{ count: 0 }]);

			const result = (await load({ url } as never)) as Record<string, unknown>;
			expect((result.pagination as Record<string, unknown>).page).toBe(1);
		});
	});

	describe('updateRole', () => {
		it('should return 403 for non-admin users', async () => {
			const event = createActionEvent(testUser, { userId: 'user-2', role: 'admin' });
			const result = await actions.updateRole(event);
			expect(result).toMatchObject({ status: 403, data: { error: 'Admin access required' } });
		});

		it('should return 401 when not authenticated', async () => {
			const event = createActionEvent(null, { userId: 'user-2', role: 'admin' });
			await expect(actions.updateRole(event)).rejects.toThrow();
		});

		it('should return 400 for invalid role', async () => {
			const event = createActionEvent(adminUser, { userId: 'user-2', role: 'superadmin' });
			const result = await actions.updateRole(event);
			expect(result).toMatchObject({ status: 400, data: { error: 'Invalid user ID or role' } });
		});

		it('should return 400 when userId is missing', async () => {
			const event = createActionEvent(adminUser, { role: 'admin' });
			const result = await actions.updateRole(event);
			expect(result).toMatchObject({ status: 400, data: { error: 'Invalid user ID or role' } });
		});

		it('should return 400 when changing own role', async () => {
			const event = createActionEvent(adminUser, { userId: adminUser.id, role: 'user' });
			const result = await actions.updateRole(event);
			expect(result).toMatchObject({ status: 400, data: { error: 'Cannot change your own role' } });
		});

		it('should update role on success', async () => {
			const event = createActionEvent(adminUser, { userId: 'user-2', role: 'admin' });
			const result = await actions.updateRole(event);
			expect(result).toMatchObject({ success: true });
			expect(mockDb.update).toHaveBeenCalled();
		});
	});

	describe('ban', () => {
		it('should return 403 for non-admin users', async () => {
			const event = createActionEvent(testUser, { userId: 'user-2' });
			const result = await actions.ban(event);
			expect(result).toMatchObject({ status: 403, data: { error: 'Admin access required' } });
		});

		it('should return 400 when userId is missing', async () => {
			const event = createActionEvent(adminUser, {});
			const result = await actions.ban(event);
			expect(result).toMatchObject({ status: 400, data: { error: 'Invalid user ID' } });
		});

		it('should return 400 when banning yourself', async () => {
			const event = createActionEvent(adminUser, { userId: adminUser.id });
			const result = await actions.ban(event);
			expect(result).toMatchObject({ status: 400, data: { error: 'Cannot ban yourself' } });
		});

		it('should ban user with reason on success', async () => {
			const event = createActionEvent(adminUser, {
				userId: 'user-2',
				banReason: 'Spam'
			});
			const result = await actions.ban(event);
			expect(result).toMatchObject({ success: true });
			expect(mockDb.update).toHaveBeenCalled();
		});
	});

	describe('unban', () => {
		it('should return 403 for non-admin users', async () => {
			const event = createActionEvent(testUser, { userId: 'user-2' });
			const result = await actions.unban(event);
			expect(result).toMatchObject({ status: 403, data: { error: 'Admin access required' } });
		});

		it('should return 400 when userId is missing', async () => {
			const event = createActionEvent(adminUser, {});
			const result = await actions.unban(event);
			expect(result).toMatchObject({ status: 400, data: { error: 'Invalid user ID' } });
		});

		it('should unban user on success', async () => {
			const event = createActionEvent(adminUser, { userId: 'user-2' });
			const result = await actions.unban(event);
			expect(result).toMatchObject({ success: true });
			expect(mockDb.update).toHaveBeenCalled();
		});
	});

	describe('approve', () => {
		it('should approve user and log audit on success', async () => {
			const event = createActionEvent(adminUser, { userId: 'user-2' });
			const result = await actions.approve(event);
			expect(result).toMatchObject({ success: true });
			expect(mockDb.update).toHaveBeenCalled();
			expect(logAudit).toHaveBeenCalledWith({
				userId: adminUser.id,
				action: 'USER_APPROVED',
				entityType: 'USER',
				entityId: 'user-2'
			});
		});
	});

	describe('reject', () => {
		it('should delete user and log audit on success', async () => {
			const event = createActionEvent(adminUser, { userId: 'user-2' });
			const result = await actions.reject(event);
			expect(result).toMatchObject({ success: true });
			expect(mockDb.delete).toHaveBeenCalled();
			expect(logAudit).toHaveBeenCalledWith({
				userId: adminUser.id,
				action: 'USER_REJECTED',
				entityType: 'USER',
				entityId: 'user-2'
			});
		});
	});
});
