import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockUnlinkOidcAccount = vi.fn();
const mockRequireAuth = vi.fn();
const mockDb = {
	select: vi.fn()
};

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	oidcProvider: {
		id: 'provider_id',
		name: 'provider_name',
		slug: 'provider_slug',
		iconUrl: 'icon_url',
		enabled: 'enabled',
		displayOrder: 'display_order'
	},
	oidcAccount: {
		id: 'id',
		externalId: 'external_id',
		email: 'email',
		name: 'name',
		providerId: 'provider_id',
		userId: 'user_id'
	}
}));
vi.mock('$lib/server/db/auth.schema', () => ({
	account: {
		id: 'account_id',
		userId: 'user_id',
		providerId: 'provider_id'
	}
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	and: vi.fn((...args: unknown[]) => args),
	asc: vi.fn((value: unknown) => value)
}));
vi.mock('$lib/server/auth-utils', () => ({
	requireAuth: mockRequireAuth
}));
vi.mock('$lib/server/oidc-account-links', () => ({
	unlinkOidcAccount: mockUnlinkOidcAccount
}));

const { actions } = await import('./+page.server');

describe('auth/account actions', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockRequireAuth.mockReturnValue({ id: 'user-1' });
	});

	it('rejects oversized unlink forms before parsing form data', async () => {
		const request = {
			headers: new Headers({ 'content-length': String(16 * 1024 + 1) }),
			formData: vi.fn()
		};

		await expect(
			actions.unlink({
				request,
				locals: { user: { id: 'user-1' } }
			} as never)
		).rejects.toMatchObject({
			status: 413,
			body: { message: 'Account form body is too large' }
		});
		expect(request.formData).not.toHaveBeenCalled();
		expect(mockUnlinkOidcAccount).not.toHaveBeenCalled();
	});
});
