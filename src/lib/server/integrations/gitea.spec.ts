import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IssueTrackerConfig } from './types';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const { createGiteaIssue, fetchGiteaIssueStatus, testGiteaConnection } = await import('./gitea');

function jsonResponse(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

const baseConfig: IssueTrackerConfig = {
	provider: 'GITEA',
	baseUrl: 'https://gitea.example.com',
	apiToken: 'gta_abc123',
	projectKey: 'org/repo',
	customTemplate: null
};

describe('Gitea integration', () => {
	beforeEach(() => vi.clearAllMocks());
	afterEach(() => vi.restoreAllMocks());

	// ── testGiteaConnection ─────────────────────────
	describe('testGiteaConnection', () => {
		it('returns ok on success', async () => {
			mockFetch.mockResolvedValue(jsonResponse({ full_name: 'org/repo', name: 'repo' }));

			const result = await testGiteaConnection(baseConfig);
			expect(result).toEqual({ ok: true, message: 'Connected to org/repo' });
		});

		it('falls back to name when full_name is absent', async () => {
			mockFetch.mockResolvedValue(jsonResponse({ name: 'repo' }));

			const result = await testGiteaConnection(baseConfig);
			expect(result).toEqual({ ok: true, message: 'Connected to repo' });
		});

		it('returns error when apiToken missing', async () => {
			const result = await testGiteaConnection({ ...baseConfig, apiToken: null });
			expect(result.ok).toBe(false);
			expect(result.message).toContain('API token is required');
		});

		it('returns error when projectKey missing', async () => {
			const result = await testGiteaConnection({ ...baseConfig, projectKey: null });
			expect(result.ok).toBe(false);
			expect(result.message).toContain('Repository');
		});

		it('returns error on non-ok response', async () => {
			mockFetch.mockResolvedValue(new Response('Unauthorized', { status: 401 }));

			const result = await testGiteaConnection(baseConfig);
			expect(result.ok).toBe(false);
			expect(result.message).toContain('401');
		});

		it('calls correct Gitea API URL with token auth', async () => {
			mockFetch.mockResolvedValue(jsonResponse({ full_name: 'org/repo' }));
			await testGiteaConnection(baseConfig);

			expect(mockFetch).toHaveBeenCalledWith(
				'https://gitea.example.com/api/v1/repos/org/repo',
				expect.objectContaining({
					headers: expect.objectContaining({
						Authorization: 'token gta_abc123',
						Accept: 'application/json'
					})
				})
			);
		});
	});

	// ── createGiteaIssue ────────────────────────────
	describe('createGiteaIssue', () => {
		it('creates issue and returns result', async () => {
			mockFetch.mockResolvedValue(
				jsonResponse({ html_url: 'https://gitea.example.com/org/repo/issues/42', number: 42 })
			);

			const result = await createGiteaIssue(baseConfig, 'Bug', 'Description');
			expect(result).toEqual({
				url: 'https://gitea.example.com/org/repo/issues/42',
				key: '#42',
				title: 'Bug'
			});
		});

		it('appends backlink to body', async () => {
			mockFetch.mockResolvedValue(jsonResponse({ html_url: 'url', number: 1 }));
			await createGiteaIssue(baseConfig, 'Bug', 'Desc', 'https://app.test.com/tc/1');

			const body = JSON.parse(mockFetch.mock.calls[0][1].body);
			expect(body.body).toContain('View in testmini');
			expect(body.body).toContain('https://app.test.com/tc/1');
		});

		it('does not append backlink when not provided', async () => {
			mockFetch.mockResolvedValue(jsonResponse({ html_url: 'url', number: 1 }));
			await createGiteaIssue(baseConfig, 'Bug', 'Just desc');

			const body = JSON.parse(mockFetch.mock.calls[0][1].body);
			expect(body.body).toBe('Just desc');
		});

		it('throws when apiToken missing', async () => {
			await expect(
				createGiteaIssue({ ...baseConfig, apiToken: null }, 'title', 'desc')
			).rejects.toThrow('API token is required');
		});

		it('throws when projectKey missing', async () => {
			await expect(
				createGiteaIssue({ ...baseConfig, projectKey: null }, 'title', 'desc')
			).rejects.toThrow('Repository (owner/repo) is required');
		});

		it('throws on non-ok response', async () => {
			mockFetch.mockResolvedValue(new Response('Unprocessable', { status: 422 }));
			await expect(createGiteaIssue(baseConfig, 'title', 'desc')).rejects.toThrow('Gitea returned 422');
		});

		it('posts to correct API endpoint', async () => {
			mockFetch.mockResolvedValue(jsonResponse({ html_url: 'url', number: 1 }));
			await createGiteaIssue(baseConfig, 'title', 'desc');

			expect(mockFetch).toHaveBeenCalledWith(
				'https://gitea.example.com/api/v1/repos/org/repo/issues',
				expect.objectContaining({ method: 'POST' })
			);
		});
	});

	// ── fetchGiteaIssueStatus ───────────────────────
	describe('fetchGiteaIssueStatus', () => {
		it('maps open state to open category', async () => {
			mockFetch.mockResolvedValue(jsonResponse({ state: 'open' }));

			const result = await fetchGiteaIssueStatus(baseConfig, 'https://gitea.example.com/org/repo/issues/42');
			expect(result).toEqual({ status: 'open', statusCategory: 'open' });
		});

		it('maps closed state to done category', async () => {
			mockFetch.mockResolvedValue(jsonResponse({ state: 'closed' }));

			const result = await fetchGiteaIssueStatus(baseConfig, 'https://gitea.example.com/org/repo/issues/5');
			expect(result).toEqual({ status: 'closed', statusCategory: 'done' });
		});

		it('extracts issue number from URL', async () => {
			mockFetch.mockResolvedValue(jsonResponse({ state: 'open' }));
			await fetchGiteaIssueStatus(baseConfig, 'https://gitea.example.com/org/repo/issues/123');

			expect(mockFetch).toHaveBeenCalledWith(
				'https://gitea.example.com/api/v1/repos/org/repo/issues/123',
				expect.any(Object)
			);
		});

		it('returns unknown for non-matching URL', async () => {
			const result = await fetchGiteaIssueStatus(baseConfig, 'https://example.com/not-gitea');
			expect(result).toEqual({ status: 'unknown', statusCategory: 'unknown' });
			expect(mockFetch).not.toHaveBeenCalled();
		});

		it('throws when apiToken missing', async () => {
			await expect(
				fetchGiteaIssueStatus({ ...baseConfig, apiToken: null }, 'https://gitea.example.com/o/r/issues/1')
			).rejects.toThrow('API token is required');
		});

		it('throws when projectKey missing', async () => {
			await expect(
				fetchGiteaIssueStatus({ ...baseConfig, projectKey: null }, 'https://gitea.example.com/o/r/issues/1')
			).rejects.toThrow('Repository (owner/repo) is required');
		});

		it('throws on non-ok response', async () => {
			mockFetch.mockResolvedValue(new Response('Not Found', { status: 404 }));
			await expect(
				fetchGiteaIssueStatus(baseConfig, 'https://gitea.example.com/org/repo/issues/999')
			).rejects.toThrow('Gitea returned 404');
		});
	});
});
