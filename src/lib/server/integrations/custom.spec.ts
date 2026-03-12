import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IssueTrackerConfig } from './types';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const { createCustomIssue } = await import('./custom');

function jsonResponse(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

const baseConfig: IssueTrackerConfig = {
	provider: 'CUSTOM',
	baseUrl: 'https://api.example.com/issues',
	apiToken: 'bearer-token',
	projectKey: null,
	customTemplate: {
		method: 'POST',
		headers: { 'X-Custom': 'value' }
	}
};

describe('Custom integration', () => {
	beforeEach(() => vi.clearAllMocks());
	afterEach(() => vi.restoreAllMocks());

	it('creates issue with custom headers', async () => {
		mockFetch.mockResolvedValue(jsonResponse({ url: 'https://example.com/issue/99', key: 'ISSUE-99' }));

		const result = await createCustomIssue(baseConfig, 'Bug', 'Description');
		expect(result).toEqual({
			url: 'https://example.com/issue/99',
			key: 'ISSUE-99',
			title: 'Bug'
		});

		expect(mockFetch).toHaveBeenCalledWith(
			'https://api.example.com/issues',
			expect.objectContaining({
				method: 'POST',
				headers: expect.objectContaining({
					'Content-Type': 'application/json',
					'X-Custom': 'value',
					Authorization: 'Bearer bearer-token'
				})
			})
		);
	});

	it('appends backlink to description', async () => {
		mockFetch.mockResolvedValue(jsonResponse({ url: 'url', key: 'K1' }));
		await createCustomIssue(baseConfig, 'Bug', 'Desc', 'https://app.test.com/tc/1');

		const body = JSON.parse(mockFetch.mock.calls[0][1].body);
		expect(body.description).toContain('Linked from testmini');
		expect(body.description).toContain('https://app.test.com/tc/1');
	});

	it('does not append backlink when not provided', async () => {
		mockFetch.mockResolvedValue(jsonResponse({ url: 'url', key: 'K1' }));
		await createCustomIssue(baseConfig, 'Bug', 'Just desc');

		const body = JSON.parse(mockFetch.mock.calls[0][1].body);
		expect(body.description).toBe('Just desc');
	});

	it('omits Authorization header when apiToken is null', async () => {
		const config = { ...baseConfig, apiToken: null };
		mockFetch.mockResolvedValue(jsonResponse({ url: 'url', id: 1 }));

		await createCustomIssue(config, 'Bug', 'desc');
		const headers = mockFetch.mock.calls[0][1].headers;
		expect(headers.Authorization).toBeUndefined();
	});

	it('throws when customTemplate is null', async () => {
		const config = { ...baseConfig, customTemplate: null };
		await expect(createCustomIssue(config, 'title', 'desc')).rejects.toThrow(
			'Custom template is required'
		);
	});

	it('throws on non-ok response', async () => {
		mockFetch.mockResolvedValue(new Response('Server Error', { status: 500 }));
		await expect(createCustomIssue(baseConfig, 'title', 'desc')).rejects.toThrow(
			'Custom provider returned 500'
		);
	});

	it('falls back to baseUrl when response has no url', async () => {
		mockFetch.mockResolvedValue(jsonResponse({ id: 42 }));

		const result = await createCustomIssue(baseConfig, 'Bug', 'desc');
		expect(result.url).toBe('https://api.example.com/issues');
		expect(result.key).toBe('42');
	});

	it('falls back to empty string for key when no key or id', async () => {
		mockFetch.mockResolvedValue(jsonResponse({}));

		const result = await createCustomIssue(baseConfig, 'Bug', 'desc');
		expect(result.key).toBe('');
	});

	it('uses default POST method when template method not specified', async () => {
		const config = {
			...baseConfig,
			customTemplate: { headers: {} }
		};
		mockFetch.mockResolvedValue(jsonResponse({ url: 'url', key: 'K' }));
		await createCustomIssue(config, 'title', 'desc');

		expect(mockFetch.mock.calls[0][1].method).toBe('POST');
	});

	it('respects custom HTTP method from template', async () => {
		const config = {
			...baseConfig,
			customTemplate: { method: 'PUT', headers: {} }
		};
		mockFetch.mockResolvedValue(jsonResponse({ url: 'url', key: 'K' }));
		await createCustomIssue(config, 'title', 'desc');

		expect(mockFetch.mock.calls[0][1].method).toBe('PUT');
	});
});
