import { describe, it, expect, vi } from 'vitest';

vi.mock('$lib/server/db', () => ({
	db: { query: { projectMember: { findFirst: vi.fn() } } }
}));

vi.mock('$lib/server/db/schema', () => ({
	projectMember: { projectId: 'project_id', userId: 'user_id' }
}));

vi.mock('drizzle-orm', () => ({
	and: vi.fn((...args: unknown[]) => args),
	eq: vi.fn((a: unknown, b: unknown) => [a, b])
}));

import { isGlobalAdmin, requireAuth } from './auth-utils';

describe('isGlobalAdmin', () => {
	it('should return true for admin role', () => {
		const user = { id: '1', role: 'admin', name: 'Admin', email: 'a@b.com' } as App.Locals['user'] & object;
		expect(isGlobalAdmin(user)).toBe(true);
	});

	it('should return false for user role', () => {
		const user = { id: '2', role: 'user', name: 'User', email: 'u@b.com' } as App.Locals['user'] & object;
		expect(isGlobalAdmin(user)).toBe(false);
	});

	it('should return false for any non-admin role', () => {
		const user = { id: '3', role: 'moderator', name: 'Mod', email: 'm@b.com' } as App.Locals['user'] & object;
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
