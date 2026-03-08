import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IssueTrackerConfig } from './issue-tracker';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const { createExternalIssue, testConnection } = await import('./issue-tracker');

function jsonResponse(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

describe('issue-tracker', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	// ── createExternalIssue ─────────────────────────────
	describe('createExternalIssue', () => {
		it('should throw for unsupported provider', async () => {
			const config: IssueTrackerConfig = {
				provider: 'UNKNOWN',
				baseUrl: 'https://example.com',
				apiToken: 'token',
				projectKey: null,
				customTemplate: null
			};

			await expect(createExternalIssue(config, 'title', 'desc')).rejects.toThrow(
				'Unsupported provider'
			);
		});

		// ── Jira ──────────────────────────────────────────
		describe('Jira', () => {
			const jiraConfig: IssueTrackerConfig = {
				provider: 'JIRA',
				baseUrl: 'https://company.atlassian.net',
				apiToken: 'user@test.com:api-token-123',
				projectKey: 'PROJ',
				customTemplate: null
			};

			it('should create a Jira issue', async () => {
				mockFetch.mockResolvedValue(jsonResponse({ key: 'PROJ-456' }));

				const result = await createExternalIssue(jiraConfig, 'Bug title', 'Bug description');

				expect(result).toEqual({
					url: 'https://company.atlassian.net/browse/PROJ-456',
					key: 'PROJ-456',
					title: 'Bug title'
				});

				expect(mockFetch).toHaveBeenCalledWith(
					'https://company.atlassian.net/rest/api/3/issue',
					expect.objectContaining({
						method: 'POST',
						headers: expect.objectContaining({
							Authorization: expect.stringContaining('Basic'),
							'Content-Type': 'application/json'
						})
					})
				);
			});

			it('should throw when Jira returns error', async () => {
				mockFetch.mockResolvedValue(new Response('Unauthorized', { status: 401 }));

				await expect(createExternalIssue(jiraConfig, 'title', 'desc')).rejects.toThrow(
					'Jira returned 401'
				);
			});

			it('should throw when projectKey is missing', async () => {
				const config = { ...jiraConfig, projectKey: null };

				await expect(createExternalIssue(config, 'title', 'desc')).rejects.toThrow(
					'Project key is required'
				);
			});

			it('should use email:token as Basic auth', async () => {
				mockFetch.mockResolvedValue(jsonResponse({ key: 'PROJ-1' }));

				await createExternalIssue(jiraConfig, 'title', 'desc');

				const call = mockFetch.mock.calls[0];
				const authHeader = call[1].headers.Authorization;
				const decoded = atob(authHeader.replace('Basic ', ''));
				expect(decoded).toBe('user@test.com:api-token-123');
			});
		});

		// ── GitHub ────────────────────────────────────────
		describe('GitHub', () => {
			const githubConfig: IssueTrackerConfig = {
				provider: 'GITHUB',
				baseUrl: 'https://github.com',
				apiToken: 'ghp_abc123',
				projectKey: 'org/repo',
				customTemplate: null
			};

			it('should create a GitHub issue', async () => {
				mockFetch.mockResolvedValue(
					jsonResponse({ html_url: 'https://github.com/org/repo/issues/42', number: 42 })
				);

				const result = await createExternalIssue(githubConfig, 'Bug', 'Description');

				expect(result).toEqual({
					url: 'https://github.com/org/repo/issues/42',
					key: '#42',
					title: 'Bug'
				});

				expect(mockFetch).toHaveBeenCalledWith(
					'https://api.github.com/repos/org/repo/issues',
					expect.objectContaining({
						method: 'POST',
						headers: expect.objectContaining({
							Authorization: 'Bearer ghp_abc123'
						})
					})
				);
			});

			it('should throw when GitHub returns error', async () => {
				mockFetch.mockResolvedValue(new Response('Not Found', { status: 404 }));

				await expect(createExternalIssue(githubConfig, 'title', 'desc')).rejects.toThrow(
					'GitHub returned 404'
				);
			});

			it('should throw when apiToken is missing', async () => {
				const config = { ...githubConfig, apiToken: null };
				await expect(createExternalIssue(config, 'title', 'desc')).rejects.toThrow(
					'API token is required'
				);
			});

			it('should throw when projectKey is missing', async () => {
				const config = { ...githubConfig, projectKey: null };
				await expect(createExternalIssue(config, 'title', 'desc')).rejects.toThrow(
					'Repository (owner/repo) is required'
				);
			});
		});

		// ── GitLab ────────────────────────────────────────
		describe('GitLab', () => {
			const gitlabConfig: IssueTrackerConfig = {
				provider: 'GITLAB',
				baseUrl: 'https://gitlab.com',
				apiToken: 'glpat-abc123',
				projectKey: '12345',
				customTemplate: null
			};

			it('should create a GitLab issue', async () => {
				mockFetch.mockResolvedValue(
					jsonResponse({ web_url: 'https://gitlab.com/group/proj/-/issues/7', iid: 7 })
				);

				const result = await createExternalIssue(gitlabConfig, 'Bug', 'Description');

				expect(result).toEqual({
					url: 'https://gitlab.com/group/proj/-/issues/7',
					key: '#7',
					title: 'Bug'
				});

				expect(mockFetch).toHaveBeenCalledWith(
					'https://gitlab.com/api/v4/projects/12345/issues',
					expect.objectContaining({
						method: 'POST',
						headers: expect.objectContaining({
							'PRIVATE-TOKEN': 'glpat-abc123'
						})
					})
				);
			});

			it('should throw when GitLab returns error', async () => {
				mockFetch.mockResolvedValue(new Response('Forbidden', { status: 403 }));

				await expect(createExternalIssue(gitlabConfig, 'title', 'desc')).rejects.toThrow(
					'GitLab returned 403'
				);
			});

			it('should throw when apiToken is missing', async () => {
				const config = { ...gitlabConfig, apiToken: null };
				await expect(createExternalIssue(config, 'title', 'desc')).rejects.toThrow(
					'API token is required'
				);
			});
		});

		// ── Custom ────────────────────────────────────────
		describe('Custom', () => {
			const customConfig: IssueTrackerConfig = {
				provider: 'CUSTOM',
				baseUrl: 'https://api.example.com/issues',
				apiToken: 'bearer-token',
				projectKey: null,
				customTemplate: {
					headers: { 'X-Custom': 'value' },
					method: 'POST'
				}
			};

			it('should create a custom issue', async () => {
				mockFetch.mockResolvedValue(
					jsonResponse({ url: 'https://example.com/issue/99', key: 'ISSUE-99' })
				);

				const result = await createExternalIssue(customConfig, 'Bug', 'Description');

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

			it('should throw when customTemplate is null', async () => {
				const config = { ...customConfig, customTemplate: null };
				await expect(createExternalIssue(config, 'title', 'desc')).rejects.toThrow(
					'Custom template is required'
				);
			});

			it('should work without apiToken', async () => {
				const config = { ...customConfig, apiToken: null };
				mockFetch.mockResolvedValue(jsonResponse({ url: 'https://example.com/1', id: 1 }));

				const result = await createExternalIssue(config, 'Bug', 'desc');
				expect(result.url).toBe('https://example.com/1');

				const call = mockFetch.mock.calls[0];
				expect(call[1].headers.Authorization).toBeUndefined();
			});

			it('should fallback to baseUrl when response has no url', async () => {
				mockFetch.mockResolvedValue(jsonResponse({ id: 1 }));

				const result = await createExternalIssue(customConfig, 'Bug', 'desc');
				expect(result.url).toBe('https://api.example.com/issues');
				expect(result.key).toBe('1');
			});
		});
	});

	// ── testConnection ──────────────────────────────────
	describe('testConnection', () => {
		it('should return error for unsupported provider', async () => {
			const config: IssueTrackerConfig = {
				provider: 'UNKNOWN',
				baseUrl: 'https://example.com',
				apiToken: 'token',
				projectKey: null,
				customTemplate: null
			};

			const result = await testConnection(config);
			expect(result.ok).toBe(false);
			expect(result.message).toContain('Unsupported provider');
		});

		it('should return ok for custom provider (no test available)', async () => {
			const config: IssueTrackerConfig = {
				provider: 'CUSTOM',
				baseUrl: 'https://example.com',
				apiToken: null,
				projectKey: null,
				customTemplate: null
			};

			const result = await testConnection(config);
			expect(result.ok).toBe(true);
			expect(result.message).toContain('no connection test available');
		});

		// ── Jira test ─────────────────────────────────────
		describe('Jira', () => {
			const jiraConfig: IssueTrackerConfig = {
				provider: 'JIRA',
				baseUrl: 'https://company.atlassian.net',
				apiToken: 'user@test.com:token',
				projectKey: 'PROJ',
				customTemplate: null
			};

			it('should return ok on successful connection', async () => {
				mockFetch.mockResolvedValue(jsonResponse({ displayName: 'Test User' }));

				const result = await testConnection(jiraConfig);
				expect(result.ok).toBe(true);
				expect(result.message).toContain('Test User');
			});

			it('should return error when apiToken missing', async () => {
				const result = await testConnection({ ...jiraConfig, apiToken: null });
				expect(result.ok).toBe(false);
				expect(result.message).toContain('API token is required');
			});

			it('should return error on failed connection', async () => {
				mockFetch.mockResolvedValue(new Response('Forbidden', { status: 403 }));

				const result = await testConnection(jiraConfig);
				expect(result.ok).toBe(false);
				expect(result.message).toContain('403');
			});
		});

		// ── GitHub test ───────────────────────────────────
		describe('GitHub', () => {
			const githubConfig: IssueTrackerConfig = {
				provider: 'GITHUB',
				baseUrl: 'https://github.com',
				apiToken: 'ghp_token',
				projectKey: 'org/repo',
				customTemplate: null
			};

			it('should return ok on successful connection', async () => {
				mockFetch.mockResolvedValue(jsonResponse({ full_name: 'org/repo' }));

				const result = await testConnection(githubConfig);
				expect(result.ok).toBe(true);
				expect(result.message).toContain('org/repo');
			});

			it('should return error when apiToken missing', async () => {
				const result = await testConnection({ ...githubConfig, apiToken: null });
				expect(result.ok).toBe(false);
				expect(result.message).toContain('API token is required');
			});

			it('should return error when projectKey missing', async () => {
				const result = await testConnection({ ...githubConfig, projectKey: null });
				expect(result.ok).toBe(false);
				expect(result.message).toContain('Repository');
			});
		});

		// ── GitLab test ───────────────────────────────────
		describe('GitLab', () => {
			const gitlabConfig: IssueTrackerConfig = {
				provider: 'GITLAB',
				baseUrl: 'https://gitlab.com',
				apiToken: 'glpat-token',
				projectKey: '12345',
				customTemplate: null
			};

			it('should return ok on successful connection', async () => {
				mockFetch.mockResolvedValue(
					jsonResponse({ name_with_namespace: 'Group / Project' })
				);

				const result = await testConnection(gitlabConfig);
				expect(result.ok).toBe(true);
				expect(result.message).toContain('Group / Project');
			});

			it('should return error when apiToken missing', async () => {
				const result = await testConnection({ ...gitlabConfig, apiToken: null });
				expect(result.ok).toBe(false);
			});

			it('should return error when projectKey missing', async () => {
				const result = await testConnection({ ...gitlabConfig, projectKey: null });
				expect(result.ok).toBe(false);
				expect(result.message).toContain('Project ID');
			});

			it('should handle fetch exceptions gracefully', async () => {
				mockFetch.mockRejectedValue(new Error('Network error'));

				const result = await testConnection(gitlabConfig);
				expect(result.ok).toBe(false);
				expect(result.message).toContain('Network error');
			});
		});
	});
});
