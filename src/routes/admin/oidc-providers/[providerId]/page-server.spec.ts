import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockSelectResult } from '$lib/server/test-helpers/mock-db';
import { adminUser, testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb, col: mockDb.col, sql: mockDb.sql }));
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
const mockValidateOidcProviderUrls = vi.hoisted(() => vi.fn());
const mockValidateOidcProviderFields = vi.hoisted(() => vi.fn());
vi.mock('$lib/server/oidc-provider-validation', () => ({
	validateOidcProviderFields: mockValidateOidcProviderFields,
	validateOidcProviderUrls: mockValidateOidcProviderUrls
}));

const { actions, load } = await import('./+page.server');

function createFormData(entries: Record<string, FormDataEntryValue>): FormData {
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
	formEntries: Record<string, FormDataEntryValue>,
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

function mockSelectSequence(results: unknown[][]) {
	let index = 0;
	mockDb.select.mockImplementation(() => {
		const chain: Record<string, unknown> = {};
		for (const method of ['from', 'where', 'leftJoin', 'groupBy', 'orderBy', 'limit', 'offset']) {
			chain[method] = vi.fn().mockReturnValue(chain);
		}
		chain.then = (resolve: (value: unknown[]) => void) =>
			Promise.resolve(results[index++] ?? []).then(resolve);
		return chain as never;
	});
}

describe('admin/oidc-providers/[providerId] +page.server', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockValidateOidcProviderFields.mockImplementation(async (input) => {
			if (
				!input.name?.trim() ||
				!input.slug?.trim() ||
				!input.clientId?.trim() ||
				!input.scopes?.trim()
			) {
				return { ok: false, error: 'Missing required fields' };
			}
			if (!/^[a-z0-9-]+$/.test(input.slug.trim())) {
				return {
					ok: false,
					error: 'Slug must contain only lowercase letters, numbers, and hyphens'
				};
			}
			return {
				ok: true,
				fields: {
					name: input.name.trim(),
					slug: input.slug.trim(),
					providerType: 'OIDC',
					clientId: input.clientId.trim(),
					clientSecret: input.clientSecret?.trim() || undefined,
					scopes: input.scopes.trim(),
					iconUrl: input.iconUrl?.trim() || null
				}
			};
		});
		mockValidateOidcProviderUrls.mockResolvedValue(null);
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
						then: (resolve: (v: unknown) => void) => Promise.resolve([mockProvider]).then(resolve)
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
					then: (resolve: (v: unknown) => void) => Promise.resolve([{ count: 5 }]).then(resolve)
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

			await expect(load({ params: { providerId: '999' } } as never)).rejects.toThrow();
		});

		it('should throw 400 for invalid provider ID', async () => {
			await expect(load({ params: { providerId: 'abc' } } as never)).rejects.toThrow();
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

		it('should reject file values before checking slug conflicts', async () => {
			const event = createActionEvent(adminUser, {
				...validUpdateData,
				name: new File(['content'], 'name.txt')
			});
			const result = await actions.update(event);

			expect(result).toMatchObject({ status: 400, data: { error: 'Missing required fields' } });
			expect(mockDb.select).not.toHaveBeenCalled();
			expect(mockDb.update).not.toHaveBeenCalled();
		});

		it('should reject file URL values before URL validation', async () => {
			const event = createActionEvent(adminUser, {
				...validUpdateData,
				authorizationUrl: new File(['content'], 'authorize.txt')
			});
			const result = await actions.update(event);

			expect(result).toMatchObject({ status: 400, data: { error: 'Missing required fields' } });
			expect(mockValidateOidcProviderUrls).not.toHaveBeenCalled();
			expect(mockDb.select).not.toHaveBeenCalled();
			expect(mockDb.update).not.toHaveBeenCalled();
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

		it('should return 400 when provider URLs are unsafe', async () => {
			mockValidateOidcProviderUrls.mockResolvedValue(
				'jwksUri: URL resolves to a private or reserved IP address'
			);

			const event = createActionEvent(adminUser, validUpdateData);
			const result = await actions.update(event);
			expect(result).toMatchObject({
				status: 400,
				data: { error: 'jwksUri: URL resolves to a private or reserved IP address' }
			});
		});

		it('should return 400 when provider field validation fails before checking slug conflicts', async () => {
			mockValidateOidcProviderFields.mockResolvedValueOnce({
				ok: false,
				error: 'providerType must be OIDC'
			});

			const event = createActionEvent(adminUser, {
				...validUpdateData,
				providerType: 'SAML'
			});
			const result = await actions.update(event);

			expect(result).toMatchObject({
				status: 400,
				data: { error: 'providerType must be OIDC' }
			});
			expect(mockDb.select).not.toHaveBeenCalled();
			expect(mockDb.update).not.toHaveBeenCalled();
		});

		it('should return 400 when slug already exists on another provider', async () => {
			mockSelectSequence([[{ id: 1 }], [{ id: 2 }]]); // provider exists, another provider has the slug

			const event = createActionEvent(adminUser, validUpdateData);
			const result = await actions.update(event);
			expect(result).toMatchObject({
				status: 400,
				data: { error: 'A provider with this slug already exists' }
			});
		});

		it('should return 404 when updating a missing provider', async () => {
			mockSelectSequence([[]]);

			const event = createActionEvent(adminUser, validUpdateData, { providerId: '99' });
			const result = await actions.update(event);

			expect(result).toMatchObject({ status: 404, data: { error: 'Provider not found' } });
			expect(mockDb.update).not.toHaveBeenCalled();
		});

		it('should update provider on success without secret', async () => {
			mockSelectSequence([[{ id: 1 }], []]); // provider exists, no slug conflict

			const event = createActionEvent(adminUser, validUpdateData);
			const result = await actions.update(event);
			expect(result).toMatchObject({ success: true });
			expect(mockDb.update).toHaveBeenCalled();
		});

		it('should encrypt clientSecret when provided', async () => {
			mockSelectSequence([[{ id: 1 }], []]); // provider exists, no slug conflict
			const { encrypt } = await import('$lib/server/crypto');

			const event = createActionEvent(adminUser, {
				...validUpdateData,
				clientSecret: 'new-secret'
			});
			const result = await actions.update(event);
			expect(result).toMatchObject({ success: true });
			expect(encrypt).toHaveBeenCalledWith('new-secret');
		});

		it.each(['-1', '1.5', 'Infinity', '9007199254740992'])(
			'should normalize invalid displayOrder %s to zero',
			async (displayOrder) => {
				mockSelectSequence([[{ id: 1 }], []]); // provider exists, no slug conflict
				const updateChain = {
					set: vi.fn().mockReturnThis(),
					where: vi.fn().mockResolvedValue(undefined)
				};
				mockDb.update.mockReturnValue(updateChain as never);

				const event = createActionEvent(adminUser, {
					...validUpdateData,
					displayOrder
				});
				const result = await actions.update(event);

				expect(result).toMatchObject({ success: true });
				expect(updateChain.set).toHaveBeenCalledWith(expect.objectContaining({ displayOrder: 0 }));
			}
		);
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
			mockSelectSequence([[{ id: 1 }], [{ count: 5 }]]);

			const event = createActionEvent(adminUser, {});
			const result = await actions.deleteProvider(event);
			expect(result).toMatchObject({
				status: 400,
				data: { error: 'Provider has linked accounts. It has been disabled instead.' }
			});
			expect(mockDb.update).toHaveBeenCalled();
		});

		it('should return 404 when deleting a missing provider', async () => {
			mockSelectResult(mockDb, []);

			const event = createActionEvent(adminUser, {}, { providerId: '99' });
			const result = await actions.deleteProvider(event);

			expect(result).toMatchObject({ status: 404, data: { error: 'Provider not found' } });
			expect(mockDb.update).not.toHaveBeenCalled();
			expect(mockDb.delete).not.toHaveBeenCalled();
		});

		it('should delete and redirect when no accounts linked', async () => {
			mockSelectSequence([[{ id: 1 }], [{ count: 0 }]]);

			const event = createActionEvent(adminUser, {});
			await expect(actions.deleteProvider(event)).rejects.toMatchObject({
				status: 302,
				location: '/admin/oidc-providers'
			});
			expect(mockDb.delete).toHaveBeenCalled();
		});
	});
});
