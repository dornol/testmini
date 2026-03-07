/**
 * Tests for the approval guard logic.
 *
 * Since SvelteKit's sequence() requires internal runtime state,
 * we test the approval guard logic as pure functions.
 */
import { describe, it, expect } from 'vitest';

/**
 * Mirrors the allowlist logic from hooks.server.ts handleBetterAuth.
 * Extracted here so we can unit-test path matching without the SvelteKit runtime.
 */
function isApprovalBypassPath(pathname: string): boolean {
	const allowedPaths = ['/auth/pending', '/api/auth', '/_app/', '/favicon'];
	return allowedPaths.some((p) => pathname.startsWith(p));
}

/**
 * Mirrors the redirect decision logic.
 */
function shouldRedirectToPending(opts: {
	hasSession: boolean;
	pathname: string;
	dbApproved: boolean | null;
}): boolean {
	if (!opts.hasSession) return false;
	if (isApprovalBypassPath(opts.pathname)) return false;
	if (opts.dbApproved === null) return false; // user not found
	return !opts.dbApproved;
}

describe('approval guard path matching', () => {
	it('should allow /auth/pending', () => {
		expect(isApprovalBypassPath('/auth/pending')).toBe(true);
	});

	it('should allow /auth/pending subpaths', () => {
		// In SvelteKit, event.url.pathname never includes query strings
		expect(isApprovalBypassPath('/auth/pending/')).toBe(true);
	});

	it('should allow /api/auth routes', () => {
		expect(isApprovalBypassPath('/api/auth/sign-out')).toBe(true);
		expect(isApprovalBypassPath('/api/auth/session')).toBe(true);
	});

	it('should allow /_app/ static assets', () => {
		expect(isApprovalBypassPath('/_app/immutable/chunks/abc.js')).toBe(true);
	});

	it('should allow /favicon paths', () => {
		expect(isApprovalBypassPath('/favicon.ico')).toBe(true);
		expect(isApprovalBypassPath('/favicon.png')).toBe(true);
	});

	it('should NOT allow /projects', () => {
		expect(isApprovalBypassPath('/projects')).toBe(false);
	});

	it('should NOT allow /admin/users', () => {
		expect(isApprovalBypassPath('/admin/users')).toBe(false);
	});

	it('should NOT allow /auth/login', () => {
		expect(isApprovalBypassPath('/auth/login')).toBe(false);
	});

	it('should NOT allow root /', () => {
		expect(isApprovalBypassPath('/')).toBe(false);
	});

	it('should NOT allow /api/projects (non-auth API)', () => {
		expect(isApprovalBypassPath('/api/projects')).toBe(false);
	});
});

describe('shouldRedirectToPending', () => {
	it('should NOT redirect when no session', () => {
		expect(shouldRedirectToPending({
			hasSession: false,
			pathname: '/projects',
			dbApproved: false
		})).toBe(false);
	});

	it('should NOT redirect for bypass paths even if unapproved', () => {
		expect(shouldRedirectToPending({
			hasSession: true,
			pathname: '/auth/pending',
			dbApproved: false
		})).toBe(false);
	});

	it('should NOT redirect when user is approved', () => {
		expect(shouldRedirectToPending({
			hasSession: true,
			pathname: '/projects',
			dbApproved: true
		})).toBe(false);
	});

	it('should redirect when user is unapproved on protected path', () => {
		expect(shouldRedirectToPending({
			hasSession: true,
			pathname: '/projects',
			dbApproved: false
		})).toBe(true);
	});

	it('should redirect from /admin/users when unapproved', () => {
		expect(shouldRedirectToPending({
			hasSession: true,
			pathname: '/admin/users',
			dbApproved: false
		})).toBe(true);
	});

	it('should redirect from / when unapproved', () => {
		expect(shouldRedirectToPending({
			hasSession: true,
			pathname: '/',
			dbApproved: false
		})).toBe(true);
	});

	it('should NOT redirect when dbApproved is null (user not found)', () => {
		expect(shouldRedirectToPending({
			hasSession: true,
			pathname: '/projects',
			dbApproved: null
		})).toBe(false);
	});

	it('should NOT redirect for /api/auth/sign-out when unapproved', () => {
		expect(shouldRedirectToPending({
			hasSession: true,
			pathname: '/api/auth/sign-out',
			dbApproved: false
		})).toBe(false);
	});
});
