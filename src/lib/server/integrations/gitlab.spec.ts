import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IssueTrackerConfig } from './types';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const { createGitlabIssue, fetchGitlabIssueStatus, testGitlabConnection } = await import('./gitlab');

function jsonResponse(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

const baseConfig: IssueTrackerConfig = {
	provider: 'GITLAB',
	baseUrl: 'https://gitlab.com',
	apiToken: 'glpat-abc123',
	projectKey: '12345',
	customTemplate: null
};

describe('GitLab integration', () => {
	beforeEach(() => vi.clearAllMocks());
	afterEach(() => vi.restoreAllMocks());

	// ── testGitlabConnection ─────────────────────────
	describe('testGitlabConnection', () => {
		it('returns ok on success', async () => {
			mockFetch.mockResolvedValue(jsonResponse({ name_with_namespace: 'Group / Project' }));

			const result = await testGitlabConnection(baseConfig);
			expect(result).toEqual({ ok: true, message: 'Connected to Group / Project' });
		});

		it('falls back to name when name_with_namespace missing', async () => {
			mockFetch.mockResolvedValue(jsonResponse({ name: 'Project' }));

			const result = await testGitlabConnection(baseConfig);
			expect(result.message).toContain('Project');
		});

		it('returns error when apiToken missing', async () => {
			const result = await testGitlabConnection({ ...baseConfig, apiToken: null });
			expect(result.ok).toBe(false);
			expect(result.message).toContain('API token is required');
		});

		it('returns error when projectKey missing', async () => {
			const result = await testGitlabConnection({ ...baseConfig, projectKey: null });
			expect(result.ok).toBe(false);
			expect(result.message).toContain('Project ID is required');
		});

		it('returns error on non-ok response', async () => {
			mockFetch.mockResolvedValue(new Response('Unauthorized', { status: 401 }));

			const result = await testGitlabConnection(baseConfig);
			expect(result.ok).toBe(false);
			expect(result.message).toContain('401');
		});

		it('uses PRIVATE-TOKEN header', async () => {
			mockFetch.mockResolvedValue(jsonResponse({ name: 'Proj' }));
			await testGitlabConnection(baseConfig);

			expect(mockFetch).toHaveBeenCalledWith(
				expect.stringContaining('/api/v4/projects/12345'),
				expect.objectContaining({
					headers: expect.objectContaining({ 'PRIVATE-TOKEN': 'glpat-abc123' })
				})
			);
		});

		it('URL-encodes projectKey', async () => {
			const config = { ...baseConfig, projectKey: 'group/subgroup/project' };
			mockFetch.mockResolvedValue(jsonResponse({ name: 'Proj' }));
			await testGitlabConnection(config);

			expect(mockFetch.mock.calls[0][0]).toContain('group%2Fsubgroup%2Fproject');
		});
	});

	// ── createGitlabIssue ────────────────────────────
	describe('createGitlabIssue', () => {
		it('creates issue and returns result', async () => {
			mockFetch.mockResolvedValue(
				jsonResponse({ web_url: 'https://gitlab.com/group/proj/-/issues/7', iid: 7 })
			);

			const result = await createGitlabIssue(baseConfig, 'Bug', 'Description');
			expect(result).toEqual({
				url: 'https://gitlab.com/group/proj/-/issues/7',
				key: '#7',
				title: 'Bug'
			});
		});

		it('appends backlink when provided', async () => {
			mockFetch.mockResolvedValue(jsonResponse({ web_url: 'url', iid: 1 }));
			await createGitlabIssue(baseConfig, 'Bug', 'Desc', 'https://app.test.com/tc/1');

			const body = JSON.parse(mockFetch.mock.calls[0][1].body);
			expect(body.description).toContain('View in testmini');
			expect(body.description).toContain('https://app.test.com/tc/1');
		});

		it('does not append backlink when not provided', async () => {
			mockFetch.mockResolvedValue(jsonResponse({ web_url: 'url', iid: 1 }));
			await createGitlabIssue(baseConfig, 'Bug', 'Just desc');

			const body = JSON.parse(mockFetch.mock.calls[0][1].body);
			expect(body.description).toBe('Just desc');
		});

		it('throws when apiToken missing', async () => {
			await expect(
				createGitlabIssue({ ...baseConfig, apiToken: null }, 'title', 'desc')
			).rejects.toThrow('API token is required');
		});

		it('throws when projectKey missing', async () => {
			await expect(
				createGitlabIssue({ ...baseConfig, projectKey: null }, 'title', 'desc')
			).rejects.toThrow('Project ID is required');
		});

		it('throws on non-ok response', async () => {
			mockFetch.mockResolvedValue(new Response('Bad Request', { status: 400 }));
			await expect(createGitlabIssue(baseConfig, 'title', 'desc')).rejects.toThrow('GitLab returned 400');
		});

		it('posts to correct API endpoint with encoded projectKey', async () => {
			const config = { ...baseConfig, projectKey: 'group/project' };
			mockFetch.mockResolvedValue(jsonResponse({ web_url: 'url', iid: 1 }));
			await createGitlabIssue(config, 'title', 'desc');

			expect(mockFetch).toHaveBeenCalledWith(
				'https://gitlab.com/api/v4/projects/group%2Fproject/issues',
				expect.objectContaining({ method: 'POST' })
			);
		});
	});

	// ── fetchGitlabIssueStatus ───────────────────────
	describe('fetchGitlabIssueStatus', () => {
		it('maps opened state to open category', async () => {
			mockFetch.mockResolvedValue(jsonResponse({ state: 'opened' }));

			const result = await fetchGitlabIssueStatus(baseConfig, 'https://gitlab.com/group/proj/-/issues/7');
			expect(result).toEqual({ status: 'opened', statusCategory: 'open' });
		});

		it('maps closed state to done category', async () => {
			mockFetch.mockResolvedValue(jsonResponse({ state: 'closed' }));

			const result = await fetchGitlabIssueStatus(baseConfig, 'https://gitlab.com/group/proj/-/issues/5');
			expect(result).toEqual({ status: 'closed', statusCategory: 'done' });
		});

		it('extracts issue iid from URL', async () => {
			mockFetch.mockResolvedValue(jsonResponse({ state: 'opened' }));
			await fetchGitlabIssueStatus(baseConfig, 'https://gitlab.com/group/proj/-/issues/42');

			expect(mockFetch.mock.calls[0][0]).toBe(
				'https://gitlab.com/api/v4/projects/12345/issues/42'
			);
		});

		it('returns unknown for non-matching URL', async () => {
			const result = await fetchGitlabIssueStatus(baseConfig, 'https://example.com/not-gitlab');
			expect(result).toEqual({ status: 'unknown', statusCategory: 'unknown' });
			expect(mockFetch).not.toHaveBeenCalled();
		});

		it('throws when apiToken missing', async () => {
			await expect(
				fetchGitlabIssueStatus({ ...baseConfig, apiToken: null }, 'https://gitlab.com/g/p/-/issues/1')
			).rejects.toThrow('API token is required');
		});

		it('throws when projectKey missing', async () => {
			await expect(
				fetchGitlabIssueStatus({ ...baseConfig, projectKey: null }, 'https://gitlab.com/g/p/-/issues/1')
			).rejects.toThrow('Project ID is required');
		});

		it('throws on non-ok response', async () => {
			mockFetch.mockResolvedValue(new Response('Not Found', { status: 404 }));
			await expect(
				fetchGitlabIssueStatus(baseConfig, 'https://gitlab.com/group/proj/-/issues/999')
			).rejects.toThrow('GitLab returned 404');
		});
	});
});
