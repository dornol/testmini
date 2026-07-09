import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const mockValidatePublicHttpUrl = vi.hoisted(() => vi.fn());
const mockFetch = vi.fn();

vi.mock('$lib/server/url-safety', () => ({
	validatePublicHttpUrl: mockValidatePublicHttpUrl
}));

vi.stubGlobal('fetch', mockFetch);

const { safeIntegrationFetch } = await import('./safe-fetch');

describe('safeIntegrationFetch', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockValidatePublicHttpUrl.mockResolvedValue({ ok: true });
		mockFetch.mockResolvedValue(new Response('{}', { status: 200 }));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('validates the final request URL and disables redirects', async () => {
		await safeIntegrationFetch('https://issues.example.com/api', {
			method: 'POST',
			headers: { Authorization: 'Bearer token' }
		});

		expect(mockValidatePublicHttpUrl).toHaveBeenCalledWith('https://issues.example.com/api');
		expect(mockFetch).toHaveBeenCalledWith(
			'https://issues.example.com/api',
			expect.objectContaining({
				method: 'POST',
				redirect: 'manual',
				signal: expect.any(AbortSignal)
			})
		);
	});

	it('blocks unsafe URLs before fetch', async () => {
		mockValidatePublicHttpUrl.mockResolvedValue({
			ok: false,
			error: 'URL resolves to a private or reserved IP address'
		});

		await expect(safeIntegrationFetch('https://127.0.0.1/api')).rejects.toThrow(
			'URL resolves to a private or reserved IP address'
		);
		expect(mockFetch).not.toHaveBeenCalled();
	});
});
