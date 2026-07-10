import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockDb = vi.hoisted(() => ({
	query: {
		project: { findFirst: vi.fn() },
		projectMember: { findFirst: vi.fn() }
	}
}));

vi.mock('$lib/server/db', () => ({
	db: mockDb
}));

vi.mock('$lib/server/db/schema', () => ({
	projectMember: { projectId: 'project_id', userId: 'user_id' }
}));

vi.mock('drizzle-orm', () => ({
	and: vi.fn((...args: unknown[]) => args),
	eq: vi.fn((a: unknown, b: unknown) => [a, b])
}));

import {
	isGlobalAdmin,
	parseId,
	requireAuth,
	requireProjectAccess,
	requireProjectRole
} from './auth-utils';

beforeEach(() => {
	vi.clearAllMocks();
});

describe('isGlobalAdmin', () => {
	it('should return true for admin role', () => {
		const user = { id: '1', role: 'admin', name: 'Admin', email: 'a@b.com' } as App.Locals['user'] &
			object;
		expect(isGlobalAdmin(user)).toBe(true);
	});

	it('should return false for user role', () => {
		const user = { id: '2', role: 'user', name: 'User', email: 'u@b.com' } as App.Locals['user'] &
			object;
		expect(isGlobalAdmin(user)).toBe(false);
	});

	it('should return false for any non-admin role', () => {
		const user = {
			id: '3',
			role: 'moderator',
			name: 'Mod',
			email: 'm@b.com'
		} as App.Locals['user'] & object;
		expect(isGlobalAdmin(user)).toBe(false);
	});
});

describe('requireAuth', () => {
	it('should return user when authenticated', () => {
		const user = { id: '1', role: 'user', name: 'Test', email: 't@b.com' };
		const locals = { user, session: null } as unknown as App.Locals;
		const result = requireAuth(locals);
		expect(result).toBe(user);
	});

	it('should throw 401 when user is null', () => {
		const locals = { user: null, session: null } as unknown as App.Locals;
		expect(() => requireAuth(locals)).toThrow();
	});

	it('should throw 401 when user is undefined', () => {
		const locals = { session: null } as unknown as App.Locals;
		expect(() => requireAuth(locals)).toThrow();
	});
});

describe('parseId', () => {
	it('should parse a positive integer ID', () => {
		expect(parseId('42', 'project ID')).toBe(42);
	});

	it.each([
		'',
		'0',
		'-1',
		'+1',
		'01',
		'1.5',
		'1e3',
		' 42',
		'42 ',
		'abc',
		'9007199254740992',
		undefined
	])('should throw 400 for invalid ID value %s', (raw) => {
		expect(() => parseId(raw, 'project ID')).toThrow();
	});
});

describe('requireProjectAccess', () => {
	it('should allow global admins only when the project exists', async () => {
		const user = { id: '1', role: 'admin', name: 'Admin', email: 'a@b.com' } as App.Locals['user'] &
			object;
		mockDb.query.project.findFirst.mockResolvedValueOnce({ id: 42 });

		await expect(requireProjectAccess(user, 42)).resolves.toEqual({ role: 'ADMIN' });
		expect(mockDb.query.project.findFirst).toHaveBeenCalledWith({
			where: expect.any(Function),
			columns: { id: true }
		});
		const where = mockDb.query.project.findFirst.mock.calls[0][0].where;
		expect(
			where(
				{ id: 'id', active: 'active' },
				{ and: (...args: unknown[]) => args, eq: (a: unknown, b: unknown) => [a, b] }
			)
		).toEqual([
			['id', 42],
			['active', true]
		]);
		expect(mockDb.query.projectMember.findFirst).not.toHaveBeenCalled();
	});

	it('should throw 404 for global admins when the project is missing', async () => {
		const user = { id: '1', role: 'admin', name: 'Admin', email: 'a@b.com' } as App.Locals['user'] &
			object;
		mockDb.query.project.findFirst.mockResolvedValueOnce(null);

		await expect(requireProjectAccess(user, 42)).rejects.toMatchObject({
			status: 404,
			body: { message: 'Project not found' }
		});
		expect(mockDb.query.projectMember.findFirst).not.toHaveBeenCalled();
	});

	it('should reject member access when the project is inactive', async () => {
		const user = { id: '2', role: 'user', name: 'User', email: 'u@b.com' } as App.Locals['user'] &
			object;
		mockDb.query.project.findFirst.mockResolvedValueOnce(null);

		await expect(requireProjectAccess(user, 42)).rejects.toMatchObject({
			status: 404,
			body: { message: 'Project not found' }
		});
		expect(mockDb.query.project.findFirst).toHaveBeenCalledWith({
			where: expect.any(Function),
			columns: { id: true }
		});
		const where = mockDb.query.project.findFirst.mock.calls[0][0].where;
		expect(
			where(
				{ id: 'id', active: 'active' },
				{ and: (...args: unknown[]) => args, eq: (a: unknown, b: unknown) => [a, b] }
			)
		).toEqual([
			['id', 42],
			['active', true]
		]);
		expect(mockDb.query.projectMember.findFirst).not.toHaveBeenCalled();
	});
});

describe('requireProjectRole', () => {
	it('should allow global admins only when the project exists', async () => {
		const user = { id: '1', role: 'admin', name: 'Admin', email: 'a@b.com' } as App.Locals['user'] &
			object;
		mockDb.query.project.findFirst.mockResolvedValueOnce({ id: 42 });

		await expect(requireProjectRole(user, 42, ['PROJECT_ADMIN'])).resolves.toEqual({
			role: 'ADMIN'
		});
		expect(mockDb.query.project.findFirst).toHaveBeenCalledWith({
			where: expect.any(Function),
			columns: { id: true }
		});
		const where = mockDb.query.project.findFirst.mock.calls[0][0].where;
		expect(
			where(
				{ id: 'id', active: 'active' },
				{ and: (...args: unknown[]) => args, eq: (a: unknown, b: unknown) => [a, b] }
			)
		).toEqual([
			['id', 42],
			['active', true]
		]);
		expect(mockDb.query.projectMember.findFirst).not.toHaveBeenCalled();
	});

	it('should throw 404 for global admins when the project is missing', async () => {
		const user = { id: '1', role: 'admin', name: 'Admin', email: 'a@b.com' } as App.Locals['user'] &
			object;
		mockDb.query.project.findFirst.mockResolvedValueOnce(null);

		await expect(requireProjectRole(user, 42, ['PROJECT_ADMIN'])).rejects.toMatchObject({
			status: 404,
			body: { message: 'Project not found' }
		});
		expect(mockDb.query.projectMember.findFirst).not.toHaveBeenCalled();
	});

	it('should reject member role checks when the project is inactive', async () => {
		const user = { id: '2', role: 'user', name: 'User', email: 'u@b.com' } as App.Locals['user'] &
			object;
		mockDb.query.project.findFirst.mockResolvedValueOnce(null);

		await expect(requireProjectRole(user, 42, ['PROJECT_ADMIN'])).rejects.toMatchObject({
			status: 404,
			body: { message: 'Project not found' }
		});
		expect(mockDb.query.project.findFirst).toHaveBeenCalledWith({
			where: expect.any(Function),
			columns: { id: true }
		});
		const where = mockDb.query.project.findFirst.mock.calls[0][0].where;
		expect(
			where(
				{ id: 'id', active: 'active' },
				{ and: (...args: unknown[]) => args, eq: (a: unknown, b: unknown) => [a, b] }
			)
		).toEqual([
			['id', 42],
			['active', true]
		]);
		expect(mockDb.query.projectMember.findFirst).not.toHaveBeenCalled();
	});
});
