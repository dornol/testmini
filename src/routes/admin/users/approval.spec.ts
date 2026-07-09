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
		mockDb.query.user = {
			findFirst: vi.fn().mockResolvedValue({ id: 'pending-user', approved: false, role: 'user' })
		};
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

		it('should return 404 when target user does not exist', async () => {
			mockDb.query.user.findFirst.mockResolvedValue(null);

			const event = createActionEvent(adminUser, { userId: 'missing-user' });
			const result = await actions.approve(event);

			expect(result).toMatchObject({ status: 404, data: { error: 'User not found' } });
			expect(mockDb.update).not.toHaveBeenCalled();
			expect(logAudit).not.toHaveBeenCalled();
		});

		it('should return 400 when target user is already approved', async () => {
			mockDb.query.user.findFirst.mockResolvedValue({
				id: 'approved-user',
				approved: true,
				role: 'user'
			});

			const event = createActionEvent(adminUser, { userId: 'approved-user' });
			const result = await actions.approve(event);

			expect(result).toMatchObject({
				status: 400,
				data: { error: 'User is already approved' }
			});
			expect(mockDb.update).not.toHaveBeenCalled();
			expect(logAudit).not.toHaveBeenCalled();
		});

		it('should set approved=true and log audit on success', async () => {
			mockUpdateReturning(mockDb, [{ id: 'pending-user-1' }]);

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

		it('should return 404 and skip audit when target disappears before approve update', async () => {
			mockUpdateReturning(mockDb, []);

			const event = createActionEvent(adminUser, { userId: 'pending-user-1' });
			const result = await actions.approve(event);

			expect(result).toMatchObject({ status: 404, data: { error: 'User not found' } });
			expect(logAudit).not.toHaveBeenCalled();
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

		it('should return 400 when rejecting yourself', async () => {
			const event = createActionEvent(adminUser, { userId: adminUser.id });
			const result = await actions.reject(event);

			expect(result).toMatchObject({ status: 400, data: { error: 'Cannot reject yourself' } });
			expect(mockDb.query.user.findFirst).not.toHaveBeenCalled();
			expect(mockDb.delete).not.toHaveBeenCalled();
		});

		it('should not delete approved users via reject', async () => {
			mockDb.query.user.findFirst.mockResolvedValue({
				id: 'approved-user',
				approved: true,
				role: 'user'
			});

			const event = createActionEvent(adminUser, { userId: 'approved-user' });
			const result = await actions.reject(event);

			expect(result).toMatchObject({
				status: 400,
				data: { error: 'Only pending users can be rejected' }
			});
			expect(mockDb.delete).not.toHaveBeenCalled();
			expect(logAudit).not.toHaveBeenCalled();
		});

		it('should delete the user and log audit on success', async () => {
			mockDeleteReturning(mockDb, [{ id: 'pending-user-2' }]);

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

		it('should call logAudit after deleting the user', async () => {
			const callOrder: string[] = [];
			(logAudit as ReturnType<typeof vi.fn>).mockImplementation(() => {
				callOrder.push('audit');
			});
			mockDb.delete.mockImplementationOnce(() => {
				callOrder.push('delete');
				return mockDeleteReturning(mockDb, [{ id: 'pending-user-3' }]);
			});

			const event = createActionEvent(adminUser, { userId: 'pending-user-3' });
			await actions.reject(event);

			expect(callOrder).toEqual(['delete', 'audit']);
		});

		it('should return 404 and skip audit when target disappears before reject delete', async () => {
			mockDeleteReturning(mockDb, []);

			const event = createActionEvent(adminUser, { userId: 'pending-user-2' });
			const result = await actions.reject(event);

			expect(result).toMatchObject({ status: 404, data: { error: 'User not found' } });
			expect(logAudit).not.toHaveBeenCalled();
		});
	});

	describe('load with pending filter', () => {
		it('should return pendingOnly=false by default', async () => {
			const url = new URL('http://localhost:5173/admin/users');
			mockSelectResult(mockDb, [{ count: 0 }]);

			const result = (await load({ url } as never)) as Record<string, unknown>;
			expect(result.pendingOnly).toBe(false);
		});

		it('should return pendingOnly=true when pending=true param is set', async () => {
			const url = new URL('http://localhost:5173/admin/users?pending=true');
			mockSelectResult(mockDb, [{ count: 0 }]);

			const result = (await load({ url } as never)) as Record<string, unknown>;
			expect(result.pendingOnly).toBe(true);
		});

		it('should query users with approved field', async () => {
			const url = new URL('http://localhost:5173/admin/users');
			// Both select calls (count + user list) return from the same chain
			// In mock, we verify the query was made; actual field mapping is drizzle's responsibility
			mockSelectResult(mockDb, [{ count: 0 }]);

			const result = (await load({ url } as never)) as Record<string, unknown>;
			expect(result.users).toBeDefined();
			expect(mockDb.select).toHaveBeenCalled();
		});
	});
});
