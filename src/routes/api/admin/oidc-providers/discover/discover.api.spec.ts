import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser, adminUser } from '$lib/server/test-helpers/fixtures';

const mockLookup = vi.fn();
const mockFetch = vi.fn();

vi.mock('$lib/server/db', () => ({ db: {} }));
vi.mock('node:dns/promises', () => ({
	lookup: mockLookup
}));

vi.stubGlobal('fetch', mockFetch);

const { POST } = await import('./+server');

describe('/api/admin/oidc-providers/discover', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
		mockFetch.mockResolvedValue({
			ok: true,
			json: vi.fn().mockResolvedValue({
				authorization_endpoint: 'https://issuer.example/authorize',
				token_endpoint: 'https://issuer.example/token',
				userinfo_endpoint: 'https://issuer.example/userinfo',
				jwks_uri: 'https://issuer.example/jwks'
			})
		});
	});

	it('should return 403 for non-admin user', async () => {
		const event = createMockEvent({
			method: 'POST',
			body: { issuerUrl: 'https://accounts.google.com' },
			user: testUser
		});
		await expect(POST(event)).rejects.toThrow();
		try {
			await POST(event);
		} catch (e: any) {
			expect(e.status).toBe(403);
		}
	});

	it('should return 400 when issuerUrl is missing', async () => {
		const event = createMockEvent({
			method: 'POST',
			body: {},
			user: adminUser
		});
		await expect(POST(event)).rejects.toThrow();
		try {
			await POST(event);
		} catch (e: any) {
			expect(e.status).toBe(400);
		}
	});

	it('should return 400 when issuerUrl is not a string', async () => {
		const event = createMockEvent({
			method: 'POST',
			body: { issuerUrl: { href: 'https://issuer.example' } },
			user: adminUser
		});

		await expect(POST(event)).rejects.toMatchObject({ status: 400 });
		expect(mockLookup).not.toHaveBeenCalled();
		expect(mockFetch).not.toHaveBeenCalled();
	});

	it('should reject issuerUrl resolving to a private address', async () => {
		mockLookup.mockResolvedValue([{ address: '10.0.0.5', family: 4 }]);

		const event = createMockEvent({
			method: 'POST',
			body: { issuerUrl: 'https://issuer.example' },
			user: adminUser
		});

		await expect(POST(event)).rejects.toMatchObject({ status: 400 });
		expect(mockFetch).not.toHaveBeenCalled();
	});

	it('should fetch discovery with redirects disabled', async () => {
		const event = createMockEvent({
			method: 'POST',
			body: { issuerUrl: 'https://issuer.example/' },
			user: adminUser
		});

		const response = await POST(event);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.authorizationUrl).toBe('https://issuer.example/authorize');
		expect(mockFetch).toHaveBeenCalledWith(
			'https://issuer.example/.well-known/openid-configuration',
			expect.objectContaining({ redirect: 'manual' })
		);
	});

	it('should reject non-object discovery documents', async () => {
		mockFetch.mockResolvedValue({
			ok: true,
			json: vi.fn().mockResolvedValue(null)
		});

		const event = createMockEvent({
			method: 'POST',
			body: { issuerUrl: 'https://empty-issuer.example' },
			user: adminUser
		});

		await expect(POST(event)).rejects.toMatchObject({ status: 400 });
	});

	it('should reject discovery documents missing required endpoints', async () => {
		mockFetch.mockResolvedValue({
			ok: true,
			json: vi.fn().mockResolvedValue({
				authorization_endpoint: 'https://issuer.example/authorize',
				jwks_uri: 'https://issuer.example/jwks'
			})
		});

		const event = createMockEvent({
			method: 'POST',
			body: { issuerUrl: 'https://incomplete-issuer.example' },
			user: adminUser
		});

		await expect(POST(event)).rejects.toMatchObject({ status: 400 });
	});

	it('should reject discovery redirects instead of following them', async () => {
		mockFetch.mockResolvedValue({
			ok: false,
			status: 302,
			json: vi.fn()
		});

		const event = createMockEvent({
			method: 'POST',
			body: { issuerUrl: 'https://redirecting-issuer.example' },
			user: adminUser
		});

		await expect(POST(event)).rejects.toMatchObject({ status: 400 });
		expect(mockFetch).toHaveBeenCalledWith(
			'https://redirecting-issuer.example/.well-known/openid-configuration',
			expect.objectContaining({ redirect: 'manual' })
		);
	});
});
