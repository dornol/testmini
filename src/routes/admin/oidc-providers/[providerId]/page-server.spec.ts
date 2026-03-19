import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockSelectResult } from '$lib/server/test-helpers/mock-db';
import { adminUser, testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	oidcProvider: {
		id: 'id',
		name: 'name',
		slug: 'slug',
		providerType: 'provider_type',
		clientId: 'client_id',
		issuerUrl: 'issuer_url',
		jwksUri: 'jwks_uri',
		authorizationUrl: 'authorization_url',
		tokenUrl: 'token_url',
		userinfoUrl: 'userinfo_url',
		scopes: 'scopes',
		enabled: 'enabled',
		autoRegister: 'auto_register',
		iconUrl: 'icon_url',
		displayOrder: 'display_order'
	},
	oidcAccount: {
		id: 'id',
		providerId: 'provider_id'
	}
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	and: vi.fn((...args: unknown[]) => args),
	ne: vi.fn((a: unknown, b: unknown) => ['ne', a, b]),
	count: vi.fn(() => 'count')
}));
vi.mock('$lib/server/crypto', () => ({
	encrypt: vi.fn((s: string) => `encrypted:${s}`)
}));

const { actions, load } = await import('./+page.server');

function createFormData(entries: Record<string, string>): FormData {
	const fd = new FormData();
	for (const [k, v] of Object.entries(entries)) {
		fd.set(k, v);
	}
	return fd;
}

const validUpdateData = {
	name: 'Google',
	slug: 'google',
	providerType: 'OIDC',
	clientId: 'client-123',
	authorizationUrl: 'https://accounts.google.com/o/oauth2/auth',
	tokenUrl: 'https://oauth2.googleapis.com/token',
	scopes: 'openid profile email'
};

function createActionEvent(
	user: NonNullable<App.Locals['user']> | null,
	formEntries: Record<string, string>,
	params: Record<string, string> = { providerId: '1' }
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
		params,
		url: new URL('http://localhost:5173/admin/oidc-providers/1')
	} as never;
}

describe('admin/oidc-providers/[providerId] +page.server', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('load', () => {
		it('should return provider and account count', async () => {
			const mockProvider = {
				id: 1,
				name: 'Google',
				slug: 'google',
				providerType: 'OIDC',
				clientId: 'client-123',
				enabled: true
			};
			// First select returns provider, second returns account count
			let callCount = 0;
			mockDb.select.mockImplementation(() => {
				callCount++;
				if (callCount === 1) {
					const chain = {
						from: vi.fn().mockReturnThis(),
						where: vi.fn().mockReturnThis(),
						leftJoin: vi.fn().mockReturnThis(),
						groupBy: vi.fn().mockReturnThis(),
						orderBy: vi.fn().mockReturnThis(),
						limit: vi.fn().mockReturnThis(),
						offset: vi.fn().mockReturnThis(),
						then: (resolve: (v: unknown) => void) =>
							Promise.resolve([mockProvider]).then(resolve)
					};
					return chain as never;
				}
				const chain = {
					from: vi.fn().mockReturnThis(),
					where: vi.fn().mockReturnThis(),
					leftJoin: vi.fn().mockReturnThis(),
					groupBy: vi.fn().mockReturnThis(),
					orderBy: vi.fn().mockReturnThis(),
					limit: vi.fn().mockReturnThis(),
					offset: vi.fn().mockReturnThis(),
					then: (resolve: (v: unknown) => void) =>
						Promise.resolve([{ count: 5 }]).then(resolve)
				};
				return chain as never;
			});

			const result = (await load({
				params: { providerId: '1' }
			} as never)) as Record<string, unknown>;
			expect(result.provider).toEqual(mockProvider);
			expect(result.accountCount).toBe(5);
		});

		it('should throw 404 when provider not found', async () => {
			mockSelectResult(mockDb, []);

			await expect(
				load({ params: { providerId: '999' } } as never)
			).rejects.toThrow();
		});

		it('should throw 400 for invalid provider ID', async () => {
			await expect(
				load({ params: { providerId: 'abc' } } as never)
			).rejects.toThrow();
		});
	});

	describe('update action', () => {
		it('should return 403 for non-admin users', async () => {
			const event = createActionEvent(testUser, validUpdateData);
			const result = await actions.update(event);
			expect(result).toMatchObject({ status: 403, data: { error: 'Admin access required' } });
		});

		it('should throw 400 for invalid provider ID', async () => {
			const event = createActionEvent(adminUser, validUpdateData, { providerId: 'abc' });
			await expect(actions.update(event)).rejects.toMatchObject({ status: 400 });
		});

		it('should return 400 when required fields are missing', async () => {
			const event = createActionEvent(adminUser, { name: 'Google' });
			const result = await actions.update(event);
			expect(result).toMatchObject({ status: 400, data: { error: 'Missing required fields' } });
		});

		it('should return 400 for invalid slug format', async () => {
			const event = createActionEvent(adminUser, {
				...validUpdateData,
				slug: 'BAD SLUG!'
			});
			const result = await actions.update(event);
			expect(result).toMatchObject({
				status: 400,
				data: { error: 'Slug must contain only lowercase letters, numbers, and hyphens' }
			});
		});

		it('should return 400 when slug already exists on another provider', async () => {
			mockSelectResult(mockDb, [{ id: 2 }]); // another provider has the slug

			const event = createActionEvent(adminUser, validUpdateData);
			const result = await actions.update(event);
			expect(result).toMatchObject({
				status: 400,
				data: { error: 'A provider with this slug already exists' }
			});
		});

		it('should update provider on success without secret', async () => {
			mockSelectResult(mockDb, []); // no slug conflict

			const event = createActionEvent(adminUser, validUpdateData);
			const result = await actions.update(event);
			expect(result).toMatchObject({ success: true });
			expect(mockDb.update).toHaveBeenCalled();
		});

		it('should encrypt clientSecret when provided', async () => {
			mockSelectResult(mockDb, []); // no slug conflict
			const { encrypt } = await import('$lib/server/crypto');

			const event = createActionEvent(adminUser, {
				...validUpdateData,
				clientSecret: 'new-secret'
			});
			const result = await actions.update(event);
			expect(result).toMatchObject({ success: true });
			expect(encrypt).toHaveBeenCalledWith('new-secret');
		});
	});

	describe('deleteProvider action', () => {
		it('should return 403 for non-admin users', async () => {
			const event = createActionEvent(testUser, {});
			const result = await actions.deleteProvider(event);
			expect(result).toMatchObject({ status: 403, data: { error: 'Admin access required' } });
		});

		it('should throw 400 for invalid provider ID', async () => {
			const event = createActionEvent(adminUser, {}, { providerId: 'abc' });
			await expect(actions.deleteProvider(event)).rejects.toMatchObject({ status: 400 });
		});

		it('should disable provider when accounts are linked', async () => {
			mockSelectResult(mockDb, [{ count: 5 }]);

			const event = createActionEvent(adminUser, {});
			const result = await actions.deleteProvider(event);
			expect(result).toMatchObject({
				status: 400,
				data: { error: 'Provider has linked accounts. It has been disabled instead.' }
			});
			expect(mockDb.update).toHaveBeenCalled();
		});

		it('should delete and redirect when no accounts linked', async () => {
			mockSelectResult(mockDb, [{ count: 0 }]);

			const event = createActionEvent(adminUser, {});
			await expect(actions.deleteProvider(event)).rejects.toMatchObject({
				status: 302,
				location: '/admin/oidc-providers'
			});
			expect(mockDb.delete).toHaveBeenCalled();
		});
	});
});
