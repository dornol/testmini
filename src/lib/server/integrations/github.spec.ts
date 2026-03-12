import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IssueTrackerConfig } from './types';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const { createGithubIssue, fetchGithubIssueStatus, testGithubConnection } = await import('./github');

function jsonResponse(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

const baseConfig: IssueTrackerConfig = {
	provider: 'GITHUB',
	baseUrl: 'https://github.com',
	apiToken: 'ghp_abc123',
	projectKey: 'org/repo',
	customTemplate: null
};

describe('GitHub integration', () => {
	beforeEach(() => vi.clearAllMocks());
	afterEach(() => vi.restoreAllMocks());

	// ── testGithubConnection ─────────────────────────
	describe('testGithubConnection', () => {
		it('returns ok on success', async () => {
			mockFetch.mockResolvedValue(jsonResponse({ full_name: 'org/repo' }));

			const result = await testGithubConnection(baseConfig);
			expect(result).toEqual({ ok: true, message: 'Connected to org/repo' });
		});

		it('returns error when apiToken missing', async () => {
			const result = await testGithubConnection({ ...baseConfig, apiToken: null });
			expect(result.ok).toBe(false);
			expect(result.message).toContain('API token is required');
		});

		it('returns error when projectKey missing', async () => {
			const result = await testGithubConnection({ ...baseConfig, projectKey: null });
			expect(result.ok).toBe(false);
			expect(result.message).toContain('Repository');
		});

		it('returns error on non-ok response', async () => {
			mockFetch.mockResolvedValue(new Response('Not Found', { status: 404 }));

			const result = await testGithubConnection(baseConfig);
			expect(result.ok).toBe(false);
			expect(result.message).toContain('404');
		});

		it('calls correct GitHub API URL', async () => {
			mockFetch.mockResolvedValue(jsonResponse({ full_name: 'org/repo' }));
			await testGithubConnection(baseConfig);

			expect(mockFetch).toHaveBeenCalledWith(
				'https://api.github.com/repos/org/repo',
				expect.objectContaining({
					headers: expect.objectContaining({
						Authorization: 'Bearer ghp_abc123',
						Accept: 'application/vnd.github+json'
					})
				})
			);
		});
	});

	// ── createGithubIssue ────────────────────────────
	describe('createGithubIssue', () => {
		it('creates issue and returns result', async () => {
			mockFetch.mockResolvedValue(
				jsonResponse({ html_url: 'https://github.com/org/repo/issues/42', number: 42 })
			);

			const result = await createGithubIssue(baseConfig, 'Bug', 'Description');
			expect(result).toEqual({
				url: 'https://github.com/org/repo/issues/42',
				key: '#42',
				title: 'Bug'
			});
		});

		it('appends backlink to body', async () => {
			mockFetch.mockResolvedValue(jsonResponse({ html_url: 'url', number: 1 }));
			await createGithubIssue(baseConfig, 'Bug', 'Desc', 'https://app.test.com/tc/1');

			const body = JSON.parse(mockFetch.mock.calls[0][1].body);
			expect(body.body).toContain('View in testmini');
			expect(body.body).toContain('https://app.test.com/tc/1');
		});

		it('does not append backlink when not provided', async () => {
			mockFetch.mockResolvedValue(jsonResponse({ html_url: 'url', number: 1 }));
			await createGithubIssue(baseConfig, 'Bug', 'Just desc');

			const body = JSON.parse(mockFetch.mock.calls[0][1].body);
			expect(body.body).toBe('Just desc');
		});

		it('throws when apiToken missing', async () => {
			await expect(
				createGithubIssue({ ...baseConfig, apiToken: null }, 'title', 'desc')
			).rejects.toThrow('API token is required');
		});

		it('throws when projectKey missing', async () => {
			await expect(
				createGithubIssue({ ...baseConfig, projectKey: null }, 'title', 'desc')
			).rejects.toThrow('Repository (owner/repo) is required');
		});

		it('throws on non-ok response', async () => {
			mockFetch.mockResolvedValue(new Response('Unprocessable', { status: 422 }));
			await expect(createGithubIssue(baseConfig, 'title', 'desc')).rejects.toThrow('GitHub returned 422');
		});

		it('posts to correct API endpoint', async () => {
			mockFetch.mockResolvedValue(jsonResponse({ html_url: 'url', number: 1 }));
			await createGithubIssue(baseConfig, 'title', 'desc');

			expect(mockFetch).toHaveBeenCalledWith(
				'https://api.github.com/repos/org/repo/issues',
				expect.objectContaining({ method: 'POST' })
			);
		});
	});

	// ── fetchGithubIssueStatus ───────────────────────
	describe('fetchGithubIssueStatus', () => {
		it('maps open state to open category', async () => {
			mockFetch.mockResolvedValue(jsonResponse({ state: 'open' }));

			const result = await fetchGithubIssueStatus(baseConfig, 'https://github.com/org/repo/issues/42');
			expect(result).toEqual({ status: 'open', statusCategory: 'open' });
		});

		it('maps closed state to done category', async () => {
			mockFetch.mockResolvedValue(jsonResponse({ state: 'closed' }));

			const result = await fetchGithubIssueStatus(baseConfig, 'https://github.com/org/repo/issues/5');
			expect(result).toEqual({ status: 'closed', statusCategory: 'done' });
		});

		it('extracts issue number from URL', async () => {
			mockFetch.mockResolvedValue(jsonResponse({ state: 'open' }));
			await fetchGithubIssueStatus(baseConfig, 'https://github.com/org/repo/issues/123');

			expect(mockFetch).toHaveBeenCalledWith(
				'https://api.github.com/repos/org/repo/issues/123',
				expect.any(Object)
			);
		});

		it('returns unknown for non-matching URL', async () => {
			const result = await fetchGithubIssueStatus(baseConfig, 'https://example.com/not-github');
			expect(result).toEqual({ status: 'unknown', statusCategory: 'unknown' });
			expect(mockFetch).not.toHaveBeenCalled();
		});

		it('throws when apiToken missing', async () => {
			await expect(
				fetchGithubIssueStatus({ ...baseConfig, apiToken: null }, 'https://github.com/o/r/issues/1')
			).rejects.toThrow('API token is required');
		});

		it('throws when projectKey missing', async () => {
			await expect(
				fetchGithubIssueStatus({ ...baseConfig, projectKey: null }, 'https://github.com/o/r/issues/1')
			).rejects.toThrow('Repository (owner/repo) is required');
		});

		it('throws on non-ok response', async () => {
			mockFetch.mockResolvedValue(new Response('Not Found', { status: 404 }));
			await expect(
				fetchGithubIssueStatus(baseConfig, 'https://github.com/org/repo/issues/999')
			).rejects.toThrow('GitHub returned 404');
		});
	});
});
