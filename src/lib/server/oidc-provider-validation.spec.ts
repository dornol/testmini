import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockValidatePublicHttpsUrl = vi.hoisted(() => vi.fn());

vi.mock('./url-safety', () => ({
	validatePublicHttpsUrl: mockValidatePublicHttpsUrl
}));

const { validateOidcProviderFields, validateOidcProviderUrls } =
	await import('./oidc-provider-validation');

describe('validateOidcProviderUrls', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockValidatePublicHttpsUrl.mockResolvedValue({ ok: true });
	});

	it('validates required and optional provider URLs', async () => {
		await expect(
			validateOidcProviderUrls({
				issuerUrl: 'https://issuer.example',
				jwksUri: 'https://issuer.example/jwks',
				authorizationUrl: 'https://issuer.example/authorize',
				tokenUrl: 'https://issuer.example/token',
				userinfoUrl: 'https://issuer.example/userinfo'
			})
		).resolves.toBeNull();

		expect(mockValidatePublicHttpsUrl).toHaveBeenCalledTimes(5);
	});

	it('rejects unsafe server-fetched URLs before they are stored', async () => {
		mockValidatePublicHttpsUrl.mockImplementation(async (url: string) => {
			if (url === 'https://127.0.0.1/token') {
				return { ok: false, error: 'URL resolves to a private or reserved IP address' };
			}
			return { ok: true };
		});

		await expect(
			validateOidcProviderUrls({
				authorizationUrl: 'https://issuer.example/authorize',
				tokenUrl: 'https://127.0.0.1/token'
			})
		).resolves.toBe('tokenUrl: URL resolves to a private or reserved IP address');
	});

	it('rejects control characters in provider URLs before URL safety lookup', async () => {
		await expect(
			validateOidcProviderUrls({
				authorizationUrl: 'https://issuer.example/authorize\nX-Test: yes',
				tokenUrl: 'https://issuer.example/token'
			})
		).resolves.toBe('authorizationUrl: URL contains invalid characters');

		expect(mockValidatePublicHttpsUrl).not.toHaveBeenCalled();
	});

	it('rejects unsupported provider types', async () => {
		await expect(
			validateOidcProviderFields({
				name: 'Example',
				slug: 'example',
				providerType: 'SAML',
				clientId: 'client-id',
				clientSecret: 'secret',
				scopes: 'openid profile email'
			})
		).resolves.toEqual({ ok: false, error: 'providerType must be OIDC' });
	});

	it('rejects overlong provider secrets', async () => {
		await expect(
			validateOidcProviderFields(
				{
					name: 'Example',
					slug: 'example',
					providerType: 'OIDC',
					clientId: 'client-id',
					clientSecret: 's'.repeat(4001),
					scopes: 'openid profile email'
				},
				{ requireClientSecret: true }
			)
		).resolves.toEqual({
			ok: false,
			error: 'Client secret must be 4000 characters or less'
		});
	});

	it('rejects control characters in provider fields', async () => {
		await expect(
			validateOidcProviderFields({
				name: 'Example',
				slug: 'example',
				providerType: 'OIDC',
				clientId: 'client\nid',
				clientSecret: 'secret',
				scopes: 'openid profile email'
			})
		).resolves.toEqual({
			ok: false,
			error: 'Client ID contains invalid characters'
		});
	});

	it('rejects control characters in client secrets', async () => {
		await expect(
			validateOidcProviderFields(
				{
					name: 'Example',
					slug: 'example',
					providerType: 'OIDC',
					clientId: 'client-id',
					clientSecret: 'secret\nvalue',
					scopes: 'openid profile email'
				},
				{ requireClientSecret: true }
			)
		).resolves.toEqual({
			ok: false,
			error: 'Client secret contains invalid characters'
		});
	});

	it('validates optional icon URLs before storing them', async () => {
		mockValidatePublicHttpsUrl.mockImplementation(async (url: string) => {
			if (url === 'https://127.0.0.1/icon.svg') {
				return { ok: false, error: 'URL resolves to a private or reserved IP address' };
			}
			return { ok: true };
		});

		await expect(
			validateOidcProviderFields({
				name: 'Example',
				slug: 'example',
				providerType: 'OIDC',
				clientId: 'client-id',
				clientSecret: 'secret',
				scopes: 'openid profile email',
				iconUrl: 'https://127.0.0.1/icon.svg'
			})
		).resolves.toEqual({
			ok: false,
			error: 'iconUrl: URL resolves to a private or reserved IP address'
		});
	});
});
