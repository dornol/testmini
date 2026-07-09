import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockValidatePublicHttpsUrl = vi.hoisted(() => vi.fn());

vi.mock('./url-safety', () => ({
	validatePublicHttpsUrl: mockValidatePublicHttpsUrl
}));

const { validateOidcProviderUrls } = await import('./oidc-provider-validation');

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
});
