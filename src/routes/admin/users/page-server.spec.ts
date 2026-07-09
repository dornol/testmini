import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	createMockDb,
	mockDeleteReturning,
	mockSelectResult,
	mockUpdateReturning
} from '$lib/server/test-helpers/mock-db';
import { adminUser, testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb, col: mockDb.col, sql: mockDb.sql }));
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

function createFormData(entries: Record<string, FormDataEntryValue>): FormData {
	const fd = new FormData();
	for (const [k, v] of Object.entries(entries)) {
		fd.set(k, v);
	}
	return fd;
}

function createActionEvent(
	user: NonNullable<App.Locals['user']> | null,
	formEntries: Record<string, FormDataEntryValue>
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
		mockDb.query.user = {
			findFirst: vi.fn().mockResolvedValue({ id: 'pending-user', approved: false, role: 'user' })
		};
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

		it.each(['Infinity', '1.5', '9007199254740992'])(
			'should fall back to page 1 for unsafe page value %s',
			async (page) => {
				const url = new URL(`http://localhost:5173/admin/users?page=${page}`);
				mockSelectResult(mockDb, [{ count: 0 }]);

				const result = (await load({ url } as never)) as Record<string, unknown>;
				expect((result.pagination as Record<string, unknown>).page).toBe(1);
			}
		);
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

		it('should return 400 for non-text role before querying target user', async () => {
			const event = createActionEvent(adminUser, {
				userId: 'user-2',
				role: new File(['admin'], 'role.txt')
			});
			const result = await actions.updateRole(event);

			expect(result).toMatchObject({ status: 400, data: { error: 'Invalid user ID or role' } });
			expect(mockDb.query.user.findFirst).not.toHaveBeenCalled();
			expect(mockDb.update).not.toHaveBeenCalled();
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

		it('should return 404 when role target user does not exist', async () => {
			mockDb.query.user.findFirst.mockResolvedValue(null);

			const event = createActionEvent(adminUser, { userId: 'missing-user', role: 'admin' });
			const result = await actions.updateRole(event);

			expect(result).toMatchObject({ status: 404, data: { error: 'User not found' } });
			expect(mockDb.update).not.toHaveBeenCalled();
		});

		it('should update role on success', async () => {
			mockUpdateReturning(mockDb, [{ id: 'user-2' }]);

			const event = createActionEvent(adminUser, { userId: 'user-2', role: 'admin' });
			const result = await actions.updateRole(event);
			expect(result).toMatchObject({ success: true });
			expect(mockDb.update).toHaveBeenCalled();
		});

		it('should return 404 when role target disappears before update', async () => {
			mockUpdateReturning(mockDb, []);

			const event = createActionEvent(adminUser, { userId: 'user-2', role: 'admin' });
			const result = await actions.updateRole(event);

			expect(result).toMatchObject({ status: 404, data: { error: 'User not found' } });
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

		it('should reject oversized ban reasons before updating', async () => {
			const event = createActionEvent(adminUser, {
				userId: 'user-2',
				banReason: 'x'.repeat(501)
			});
			const result = await actions.ban(event);

			expect(result).toMatchObject({
				status: 400,
				data: { error: 'Ban reason must be 500 characters or less' }
			});
			expect(mockDb.query.user.findFirst).not.toHaveBeenCalled();
			expect(mockDb.update).not.toHaveBeenCalled();
		});

		it('should return 404 when ban target user does not exist', async () => {
			mockDb.query.user.findFirst.mockResolvedValue(null);

			const event = createActionEvent(adminUser, { userId: 'missing-user' });
			const result = await actions.ban(event);

			expect(result).toMatchObject({ status: 404, data: { error: 'User not found' } });
			expect(mockDb.update).not.toHaveBeenCalled();
		});

		it('should ban user with reason on success', async () => {
			mockUpdateReturning(mockDb, [{ id: 'user-2' }]);

			const event = createActionEvent(adminUser, {
				userId: 'user-2',
				banReason: 'Spam'
			});
			const result = await actions.ban(event);
			expect(result).toMatchObject({ success: true });
			expect(mockDb.update).toHaveBeenCalled();
		});

		it('should return 404 when ban target disappears before update', async () => {
			mockUpdateReturning(mockDb, []);

			const event = createActionEvent(adminUser, { userId: 'user-2' });
			const result = await actions.ban(event);

			expect(result).toMatchObject({ status: 404, data: { error: 'User not found' } });
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

		it('should return 404 when unban target user does not exist', async () => {
			mockDb.query.user.findFirst.mockResolvedValue(null);

			const event = createActionEvent(adminUser, { userId: 'missing-user' });
			const result = await actions.unban(event);

			expect(result).toMatchObject({ status: 404, data: { error: 'User not found' } });
			expect(mockDb.update).not.toHaveBeenCalled();
		});

		it('should unban user on success', async () => {
			mockUpdateReturning(mockDb, [{ id: 'user-2' }]);

			const event = createActionEvent(adminUser, { userId: 'user-2' });
			const result = await actions.unban(event);
			expect(result).toMatchObject({ success: true });
			expect(mockDb.update).toHaveBeenCalled();
		});

		it('should return 404 when unban target disappears before update', async () => {
			mockUpdateReturning(mockDb, []);

			const event = createActionEvent(adminUser, { userId: 'user-2' });
			const result = await actions.unban(event);

			expect(result).toMatchObject({ status: 404, data: { error: 'User not found' } });
		});
	});

	describe('approve', () => {
		it('should return 404 when approve target user does not exist', async () => {
			mockDb.query.user.findFirst.mockResolvedValue(null);

			const event = createActionEvent(adminUser, { userId: 'missing-user' });
			const result = await actions.approve(event);

			expect(result).toMatchObject({ status: 404, data: { error: 'User not found' } });
			expect(mockDb.update).not.toHaveBeenCalled();
			expect(logAudit).not.toHaveBeenCalled();
		});

		it('should not approve an already approved user', async () => {
			mockDb.query.user.findFirst.mockResolvedValue({ id: 'user-2', approved: true });

			const event = createActionEvent(adminUser, { userId: 'user-2' });
			const result = await actions.approve(event);

			expect(result).toMatchObject({
				status: 400,
				data: { error: 'User is already approved' }
			});
			expect(mockDb.update).not.toHaveBeenCalled();
			expect(logAudit).not.toHaveBeenCalled();
		});

		it('should approve user and log audit on success', async () => {
			mockUpdateReturning(mockDb, [{ id: 'user-2' }]);

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

		it('should return 404 and skip audit when approve target disappears before update', async () => {
			mockUpdateReturning(mockDb, []);

			const event = createActionEvent(adminUser, { userId: 'user-2' });
			const result = await actions.approve(event);

			expect(result).toMatchObject({ status: 404, data: { error: 'User not found' } });
			expect(logAudit).not.toHaveBeenCalled();
		});
	});

	describe('reject', () => {
		it('should return 400 when rejecting yourself', async () => {
			const event = createActionEvent(adminUser, { userId: adminUser.id });
			const result = await actions.reject(event);

			expect(result).toMatchObject({ status: 400, data: { error: 'Cannot reject yourself' } });
			expect(mockDb.query.user.findFirst).not.toHaveBeenCalled();
			expect(mockDb.delete).not.toHaveBeenCalled();
		});

		it('should not delete an already approved user', async () => {
			mockDb.query.user.findFirst.mockResolvedValue({
				id: 'user-2',
				approved: true,
				role: 'user'
			});

			const event = createActionEvent(adminUser, { userId: 'user-2' });
			const result = await actions.reject(event);

			expect(result).toMatchObject({
				status: 400,
				data: { error: 'Only pending users can be rejected' }
			});
			expect(mockDb.delete).not.toHaveBeenCalled();
			expect(logAudit).not.toHaveBeenCalled();
		});

		it('should not delete an admin user through the reject action', async () => {
			mockDb.query.user.findFirst.mockResolvedValue({
				id: 'admin-2',
				approved: false,
				role: 'admin'
			});

			const event = createActionEvent(adminUser, { userId: 'admin-2' });
			const result = await actions.reject(event);

			expect(result).toMatchObject({
				status: 400,
				data: { error: 'Only pending users can be rejected' }
			});
			expect(mockDb.delete).not.toHaveBeenCalled();
			expect(logAudit).not.toHaveBeenCalled();
		});

		it('should delete user and log audit on success', async () => {
			mockDeleteReturning(mockDb, [{ id: 'user-2' }]);

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

		it('should return 404 and skip audit when reject target disappears before delete', async () => {
			mockDeleteReturning(mockDb, []);

			const event = createActionEvent(adminUser, { userId: 'user-2' });
			const result = await actions.reject(event);

			expect(result).toMatchObject({ status: 404, data: { error: 'User not found' } });
			expect(logAudit).not.toHaveBeenCalled();
		});
	});
});
