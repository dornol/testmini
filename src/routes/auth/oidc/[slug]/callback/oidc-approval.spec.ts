/**
 * Tests for the OIDC callback approval queue logic.
 *
 * Select call sequence for a new user (no existing account or email match):
 *   0: db.select().from(oidcProvider)     → provider
 *   1: db.select().from(oidcAccount)      → [] (no existing link)
 *   2: db.select().from(user) by email    → [] (no email match)
 *   -- inserts user + oidcAccount --
 *   3: db.select().from(user) by role     → admin users (only when !approved)
 *   4: db.select().from(user) by id       → banned/approved check
 *
 * For returning user (existing oidcAccount link):
 *   0: provider
 *   1: existing oidcAccount → { userId }
 *   2: banned/approved check
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb } from '$lib/server/test-helpers/mock-db';

const mockDb = createMockDb();
const mockLogAudit = vi.fn();
const mockCreateNotification = vi.fn();
const mockFetch = vi.fn();

function resolveChain(result: unknown[]) {
	const c: Record<string, unknown> = {};
	const methods = ['from', 'where', 'orderBy', 'limit', 'offset', 'set', 'values', 'returning', 'onConflictDoNothing', 'onConflictDoUpdate'];
	for (const m of methods) c[m] = vi.fn().mockReturnValue(c);
	c.then = (resolve: (v: unknown) => void) => Promise.resolve(result).then(resolve);
	return c;
}

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	oidcProvider: { slug: 'slug', enabled: 'enabled', id: 'id', clientId: 'client_id', clientSecretEncrypted: 'client_secret_encrypted', tokenUrl: 'token_url', jwksUri: 'jwks_uri', issuerUrl: 'issuer_url', userinfoUrl: 'userinfo_url', autoRegister: 'auto_register' },
	oidcAccount: { userId: 'user_id', providerId: 'provider_id', externalId: 'external_id', email: 'email', name: 'name' }
}));
vi.mock('$lib/server/db/auth.schema', () => ({
	user: { id: 'id', name: 'name', email: 'email', emailVerified: 'email_verified', approved: 'approved', banned: 'banned', role: 'role' },
	session: { id: 'id', token: 'token', userId: 'user_id', expiresAt: 'expires_at', createdAt: 'created_at', updatedAt: 'updated_at' }
}));
vi.mock('drizzle-orm', () => ({
	and: vi.fn((...args: unknown[]) => args),
	eq: vi.fn((a: unknown, b: unknown) => [a, b])
}));
vi.mock('$lib/server/crypto', () => ({ decrypt: vi.fn((v: string) => v) }));
vi.mock('$lib/server/oidc-jwt', () => ({
	verifyIdToken: vi.fn(),
	parseIdTokenPayload: vi.fn(() => ({ sub: 'oidc-sub-123', email: 'new@example.com', name: 'New User' }))
}));
vi.mock('$env/dynamic/private', () => ({
	env: { ORIGIN: 'http://localhost:5173', BETTER_AUTH_SECRET: 'test-secret-key' }
}));
vi.mock('$lib/server/logger', () => ({
	childLogger: () => ({ child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}));
vi.mock('$lib/server/audit', () => ({ logAudit: mockLogAudit }));
vi.mock('$lib/server/notifications', () => ({ createNotification: mockCreateNotification }));
vi.stubGlobal('fetch', mockFetch);

const { GET } = await import('./+server');

const baseProvider = {
	id: 'provider-1', slug: 'test-idp', clientId: 'client-123', clientSecretEncrypted: 'encrypted-secret',
	tokenUrl: 'https://idp.example.com/token', jwksUri: null, issuerUrl: null, userinfoUrl: null,
	autoRegister: true, enabled: true
};

function createCallbackEvent() {
	return {
		params: { slug: 'test-idp' },
		url: new URL('http://localhost:5173/auth/oidc/test-idp/callback?code=auth-code&state=test-state'),
		cookies: {
			get: vi.fn((name: string) => name === 'oidc_test-idp' ? JSON.stringify({ codeVerifier: 'verifier', state: 'test-state' }) : undefined),
			set: vi.fn(),
			delete: vi.fn()
		},
		locals: { user: undefined, requestId: 'test-req' }
	} as never;
}

function setupMocks(selectResults: unknown[][]) {
	let selectIdx = 0;
	mockDb.select.mockImplementation(() => resolveChain(selectResults[selectIdx++] ?? []) as never);
	mockDb.insert.mockImplementation(() => resolveChain([]) as never);

	mockFetch.mockResolvedValue(
		new Response(JSON.stringify({ id_token: 'header.eyJ0ZXN0IjoidGVzdCJ9.sig', access_token: 'at-123' }), {
			status: 200, headers: { 'Content-Type': 'application/json' }
		})
	);
}

async function runCallback(selectResults: unknown[][]) {
	setupMocks(selectResults);
	const event = createCallbackEvent();
	try {
		await GET(event);
		return { redirected: false, location: '' };
	} catch (e: unknown) {
		const err = e as { status: number; location: string };
		return { redirected: true, status: err.status, location: err.location };
	}
}

describe('OIDC callback - approval queue', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should redirect new user to /projects when autoRegister=true', async () => {
		const result = await runCallback([
			[{ ...baseProvider, autoRegister: true }],  // 0: provider
			[],                                          // 1: no oidcAccount
			[],                                          // 2: no email match
			// no admin lookup since autoRegister=true
			[{ banned: false, approved: true }]          // 3: banned/approved check
		]);

		expect(result.redirected).toBe(true);
		expect(result.location).toBe('/projects');
		expect(mockLogAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'REGISTER' }));
		expect(mockCreateNotification).not.toHaveBeenCalled();
	});

	it('should redirect new user to /auth/pending when autoRegister=false and notify admins', async () => {
		const result = await runCallback([
			[{ ...baseProvider, autoRegister: false }],  // 0: provider
			[],                                           // 1: no oidcAccount
			[],                                           // 2: no email match
			[{ id: 'admin-1' }, { id: 'admin-2' }],     // 3: admin users lookup
			[{ banned: false, approved: false }]          // 4: banned/approved check
		]);

		expect(result.redirected).toBe(true);
		expect(result.location).toBe('/auth/pending');
		expect(mockLogAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'USER_PENDING_APPROVAL' }));
		expect(mockCreateNotification).toHaveBeenCalledTimes(2);
		expect(mockCreateNotification).toHaveBeenCalledWith(expect.objectContaining({
			userId: 'admin-1',
			type: 'USER_PENDING',
			link: '/admin/users?pending=true'
		}));
		expect(mockCreateNotification).toHaveBeenCalledWith(expect.objectContaining({
			userId: 'admin-2',
			type: 'USER_PENDING'
		}));
	});

	it('should redirect returning unapproved user to /auth/pending', async () => {
		const result = await runCallback([
			[{ ...baseProvider, autoRegister: true }],  // 0: provider
			[{ userId: 'existing-user-1' }],            // 1: existing oidcAccount
			[{ banned: false, approved: false }]        // 2: user not approved
		]);

		expect(result.redirected).toBe(true);
		expect(result.location).toBe('/auth/pending');
		expect(mockLogAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'USER_PENDING_APPROVAL' }));
	});

	it('should redirect banned user to login error page', async () => {
		const result = await runCallback([
			[{ ...baseProvider, autoRegister: true }],  // 0: provider
			[{ userId: 'banned-user' }],                // 1: existing oidcAccount
			[{ banned: true, approved: true }]          // 2: user is banned
		]);

		expect(result.redirected).toBe(true);
		expect(result.location).toBe('/auth/login?error=oidc_callback_error');
	});

	it('should redirect existing approved user to /projects with LOGIN audit', async () => {
		const result = await runCallback([
			[{ ...baseProvider, autoRegister: true }],  // 0: provider
			[{ userId: 'existing-user-1' }],            // 1: existing oidcAccount
			[{ banned: false, approved: true }]         // 2: user approved
		]);

		expect(result.redirected).toBe(true);
		expect(result.location).toBe('/projects');
		expect(mockLogAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'LOGIN' }));
		expect(mockCreateNotification).not.toHaveBeenCalled();
	});

	it('should include user name and email in notification message', async () => {
		await runCallback([
			[{ ...baseProvider, autoRegister: false }],
			[],
			[],
			[{ id: 'admin-1' }],
			[{ banned: false, approved: false }]
		]);

		expect(mockCreateNotification).toHaveBeenCalledWith(expect.objectContaining({
			message: expect.stringContaining('New User')
		}));
		expect(mockCreateNotification).toHaveBeenCalledWith(expect.objectContaining({
			message: expect.stringContaining('new@example.com')
		}));
	});

	it('should not send notifications when no admins exist', async () => {
		await runCallback([
			[{ ...baseProvider, autoRegister: false }],
			[],
			[],
			[],                                           // no admin users
			[{ banned: false, approved: false }]
		]);

		expect(mockCreateNotification).not.toHaveBeenCalled();
	});
});
