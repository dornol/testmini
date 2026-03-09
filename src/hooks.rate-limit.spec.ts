import { describe, it, expect } from 'vitest';

/**
 * Tests for rate limit rule matching logic extracted from hooks.server.ts.
 * We test the match functions directly without importing the full hooks module.
 */

interface RateLimitRule {
	match: (pathname: string, method: string) => boolean;
	limit: number;
	apiKeyLimit?: number;
	windowMs: number;
	label: string;
}

// Replicate the rules from hooks.server.ts
const RATE_LIMIT_RULES: RateLimitRule[] = [
	{
		label: 'auth:sign-in',
		match: (p) => p === '/api/auth/sign-in',
		limit: 10,
		windowMs: 60_000
	},
	{
		label: 'auth:sign-up',
		match: (p) => p === '/api/auth/sign-up',
		limit: 10,
		windowMs: 60_000
	},
	{
		label: 'api:attachments',
		match: (p, m) => p === '/api/attachments' && m === 'POST',
		limit: 30,
		apiKeyLimit: 100,
		windowMs: 60_000
	},
	{
		label: 'api:bulk',
		match: (p, m) => /^\/api\/[^/]+(?:\/[^/]+)*\/bulk$/.test(p) && m === 'POST',
		limit: 20,
		apiKeyLimit: 60,
		windowMs: 60_000
	},
	{
		label: 'auth:password',
		match: (p, m) => p.endsWith('/changePassword') && m === 'POST',
		limit: 5,
		windowMs: 60_000
	},
	{
		label: 'api:profile',
		match: (p, m) => p.startsWith('/api/users/me') && (m === 'PUT' || m === 'PATCH'),
		limit: 20,
		windowMs: 60_000
	},
	{
		label: 'api:general',
		match: (p) => p.startsWith('/api/'),
		limit: 100,
		apiKeyLimit: 300,
		windowMs: 60_000
	}
];

function findRule(pathname: string, method: string): RateLimitRule | undefined {
	return RATE_LIMIT_RULES.find((r) => r.match(pathname, method));
}

describe('Rate limit rule matching', () => {
	describe('auth:sign-in', () => {
		it('should match /api/auth/sign-in', () => {
			expect(findRule('/api/auth/sign-in', 'POST')?.label).toBe('auth:sign-in');
		});

		it('should not match /api/auth/sign-in/extra', () => {
			expect(findRule('/api/auth/sign-in/extra', 'POST')?.label).not.toBe('auth:sign-in');
		});
	});

	describe('auth:sign-up', () => {
		it('should match /api/auth/sign-up', () => {
			expect(findRule('/api/auth/sign-up', 'POST')?.label).toBe('auth:sign-up');
		});
	});

	describe('api:attachments', () => {
		it('should match POST /api/attachments', () => {
			expect(findRule('/api/attachments', 'POST')?.label).toBe('api:attachments');
		});

		it('should not match GET /api/attachments (falls through to general)', () => {
			expect(findRule('/api/attachments', 'GET')?.label).toBe('api:general');
		});

		it('should have apiKeyLimit of 100', () => {
			expect(findRule('/api/attachments', 'POST')?.apiKeyLimit).toBe(100);
		});
	});

	describe('api:bulk', () => {
		it('should match POST /api/projects/1/test-cases/bulk', () => {
			expect(findRule('/api/projects/1/test-cases/bulk', 'POST')?.label).toBe('api:bulk');
		});

		it('should match POST /api/projects/1/bulk', () => {
			expect(findRule('/api/projects/1/bulk', 'POST')?.label).toBe('api:bulk');
		});

		it('should not match GET /api/projects/1/test-cases/bulk', () => {
			expect(findRule('/api/projects/1/test-cases/bulk', 'GET')?.label).toBe('api:general');
		});

		it('should not match /api/bulk/extra', () => {
			expect(findRule('/api/bulk/extra', 'POST')?.label).not.toBe('api:bulk');
		});
	});

	describe('auth:password', () => {
		it('should match POST endpoints ending with /changePassword', () => {
			expect(findRule('/auth/profile/changePassword', 'POST')?.label).toBe('auth:password');
		});

		it('should match POST /account/changePassword', () => {
			expect(findRule('/account/changePassword', 'POST')?.label).toBe('auth:password');
		});

		it('should not match GET /auth/profile/changePassword', () => {
			const rule = findRule('/auth/profile/changePassword', 'GET');
			expect(rule?.label).not.toBe('auth:password');
		});

		it('should have a strict limit of 5', () => {
			expect(findRule('/auth/profile/changePassword', 'POST')?.limit).toBe(5);
		});
	});

	describe('api:profile', () => {
		it('should match PUT /api/users/me/preferences', () => {
			expect(findRule('/api/users/me/preferences', 'PUT')?.label).toBe('api:profile');
		});

		it('should match PATCH /api/users/me/preferences', () => {
			expect(findRule('/api/users/me/preferences', 'PATCH')?.label).toBe('api:profile');
		});

		it('should not match GET /api/users/me/preferences (falls to general)', () => {
			expect(findRule('/api/users/me/preferences', 'GET')?.label).toBe('api:general');
		});

		it('should not match POST /api/users/me/preferences (falls to general)', () => {
			expect(findRule('/api/users/me/preferences', 'POST')?.label).toBe('api:general');
		});

		it('should have a limit of 20', () => {
			expect(findRule('/api/users/me/preferences', 'PUT')?.limit).toBe(20);
		});
	});

	describe('api:general catch-all', () => {
		it('should match any /api/ path not caught by specific rules', () => {
			expect(findRule('/api/projects/1/test-cases', 'GET')?.label).toBe('api:general');
		});

		it('should not match non-api paths', () => {
			expect(findRule('/dashboard', 'GET')).toBeUndefined();
		});

		it('should not match root path', () => {
			expect(findRule('/', 'GET')).toBeUndefined();
		});

		it('should have apiKeyLimit of 300', () => {
			expect(findRule('/api/projects/1/test-cases', 'GET')?.apiKeyLimit).toBe(300);
		});
	});

	describe('Rule priority (first match wins)', () => {
		it('sign-in should match before general catch-all', () => {
			expect(findRule('/api/auth/sign-in', 'POST')?.label).toBe('auth:sign-in');
		});

		it('password change on api path should match auth:password before api:general', () => {
			expect(findRule('/api/account/changePassword', 'POST')?.label).toBe('auth:password');
		});

		it('profile PUT should match api:profile before api:general', () => {
			expect(findRule('/api/users/me/preferences', 'PUT')?.label).toBe('api:profile');
		});

		it('bulk POST should match api:bulk before api:general', () => {
			expect(findRule('/api/projects/1/tags/bulk', 'POST')?.label).toBe('api:bulk');
		});
	});
});
