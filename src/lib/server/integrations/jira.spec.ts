import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IssueTrackerConfig } from './types';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const { createJiraIssue, fetchJiraIssueStatus, testJiraConnection } = await import('./jira');

function jsonResponse(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

const baseConfig: IssueTrackerConfig = {
	provider: 'JIRA',
	baseUrl: 'https://company.atlassian.net',
	apiToken: 'user@test.com:api-token-123',
	projectKey: 'PROJ',
	customTemplate: null
};

describe('Jira integration', () => {
	beforeEach(() => vi.clearAllMocks());
	afterEach(() => vi.restoreAllMocks());

	// ── jiraAuthHeader (tested indirectly) ────────────
	describe('auth header', () => {
		it('uses email:token as Basic auth', async () => {
			mockFetch.mockResolvedValue(jsonResponse({ key: 'PROJ-1' }));
			await createJiraIssue(baseConfig, 'title', 'desc');

			const authHeader = mockFetch.mock.calls[0][1].headers.Authorization;
			const decoded = atob(authHeader.replace('Basic ', ''));
			expect(decoded).toBe('user@test.com:api-token-123');
		});

		it('prepends default email when token has no colon', async () => {
			const config = { ...baseConfig, apiToken: 'bare-token' };
			mockFetch.mockResolvedValue(jsonResponse({ key: 'PROJ-1' }));
			await createJiraIssue(config, 'title', 'desc');

			const authHeader = mockFetch.mock.calls[0][1].headers.Authorization;
			const decoded = atob(authHeader.replace('Basic ', ''));
			expect(decoded).toBe('user@example.com:bare-token');
		});

		it('throws when apiToken is null', async () => {
			const config = { ...baseConfig, apiToken: null };
			await expect(createJiraIssue(config, 'title', 'desc')).rejects.toThrow('API token is required');
		});
	});

	// ── testJiraConnection ───────────────────────────
	describe('testJiraConnection', () => {
		it('returns ok with displayName on success', async () => {
			mockFetch.mockResolvedValue(jsonResponse({ displayName: 'John Doe' }));

			const result = await testJiraConnection(baseConfig);
			expect(result).toEqual({ ok: true, message: 'Connected as John Doe' });
			expect(mockFetch).toHaveBeenCalledWith(
				'https://company.atlassian.net/rest/api/3/myself',
				expect.objectContaining({
					headers: expect.objectContaining({ Accept: 'application/json' })
				})
			);
		});

		it('falls back to emailAddress when no displayName', async () => {
			mockFetch.mockResolvedValue(jsonResponse({ emailAddress: 'user@test.com' }));

			const result = await testJiraConnection(baseConfig);
			expect(result.message).toContain('user@test.com');
		});

		it('returns "unknown" when neither displayName nor emailAddress', async () => {
			mockFetch.mockResolvedValue(jsonResponse({}));

			const result = await testJiraConnection(baseConfig);
			expect(result.message).toContain('unknown');
		});

		it('returns error when apiToken is null', async () => {
			const result = await testJiraConnection({ ...baseConfig, apiToken: null });
			expect(result.ok).toBe(false);
			expect(result.message).toContain('API token is required');
		});

		it('returns error on non-ok response', async () => {
			mockFetch.mockResolvedValue(new Response('Forbidden', { status: 403 }));

			const result = await testJiraConnection(baseConfig);
			expect(result.ok).toBe(false);
			expect(result.message).toContain('403');
		});
	});

	// ── createJiraIssue ──────────────────────────────
	describe('createJiraIssue', () => {
		it('creates issue with ADF description', async () => {
			mockFetch.mockResolvedValue(jsonResponse({ key: 'PROJ-42' }));

			const result = await createJiraIssue(baseConfig, 'Bug title', 'Bug desc');
			expect(result).toEqual({
				url: 'https://company.atlassian.net/browse/PROJ-42',
				key: 'PROJ-42',
				title: 'Bug title'
			});

			const body = JSON.parse(mockFetch.mock.calls[0][1].body);
			expect(body.fields.project.key).toBe('PROJ');
			expect(body.fields.summary).toBe('Bug title');
			expect(body.fields.issuetype.name).toBe('Bug');
			expect(body.fields.description.type).toBe('doc');
		});

		it('appends backlink to description when provided', async () => {
			mockFetch.mockResolvedValue(jsonResponse({ key: 'PROJ-1' }));
			await createJiraIssue(baseConfig, 'title', 'desc', 'https://app.testmini.com/tc/1');

			const body = JSON.parse(mockFetch.mock.calls[0][1].body);
			const content = body.fields.description.content;
			expect(content).toHaveLength(2);
			expect(content[1].content[1].marks[0].attrs.href).toBe('https://app.testmini.com/tc/1');
		});

		it('omits backlink paragraph when not provided', async () => {
			mockFetch.mockResolvedValue(jsonResponse({ key: 'PROJ-1' }));
			await createJiraIssue(baseConfig, 'title', 'desc');

			const body = JSON.parse(mockFetch.mock.calls[0][1].body);
			expect(body.fields.description.content).toHaveLength(1);
		});

		it('throws when projectKey is null', async () => {
			await expect(
				createJiraIssue({ ...baseConfig, projectKey: null }, 'title', 'desc')
			).rejects.toThrow('Project key is required');
		});

		it('throws on non-ok response', async () => {
			mockFetch.mockResolvedValue(new Response('Server Error', { status: 500 }));
			await expect(createJiraIssue(baseConfig, 'title', 'desc')).rejects.toThrow('Jira returned 500');
		});
	});

	// ── fetchJiraIssueStatus ─────────────────────────
	describe('fetchJiraIssueStatus', () => {
		it('returns unknown for null externalKey', async () => {
			const result = await fetchJiraIssueStatus(baseConfig, null);
			expect(result).toEqual({ status: 'unknown', statusCategory: 'unknown' });
			expect(mockFetch).not.toHaveBeenCalled();
		});

		it('maps "new" category to "open"', async () => {
			mockFetch.mockResolvedValue(
				jsonResponse({
					fields: { status: { name: 'To Do', statusCategory: { key: 'new' } } }
				})
			);

			const result = await fetchJiraIssueStatus(baseConfig, 'PROJ-42');
			expect(result).toEqual({ status: 'To Do', statusCategory: 'open' });
		});

		it('maps "indeterminate" category to "in_progress"', async () => {
			mockFetch.mockResolvedValue(
				jsonResponse({
					fields: { status: { name: 'In Progress', statusCategory: { key: 'indeterminate' } } }
				})
			);

			const result = await fetchJiraIssueStatus(baseConfig, 'PROJ-1');
			expect(result.statusCategory).toBe('in_progress');
		});

		it('maps "done" category to "done"', async () => {
			mockFetch.mockResolvedValue(
				jsonResponse({
					fields: { status: { name: 'Done', statusCategory: { key: 'done' } } }
				})
			);

			const result = await fetchJiraIssueStatus(baseConfig, 'PROJ-1');
			expect(result.statusCategory).toBe('done');
		});

		it('maps unknown category key to "unknown"', async () => {
			mockFetch.mockResolvedValue(
				jsonResponse({
					fields: { status: { name: 'Custom', statusCategory: { key: 'custom_key' } } }
				})
			);

			const result = await fetchJiraIssueStatus(baseConfig, 'PROJ-1');
			expect(result.statusCategory).toBe('unknown');
		});

		it('handles missing status fields gracefully', async () => {
			mockFetch.mockResolvedValue(jsonResponse({ fields: {} }));

			const result = await fetchJiraIssueStatus(baseConfig, 'PROJ-1');
			expect(result).toEqual({ status: 'unknown', statusCategory: 'unknown' });
		});

		it('encodes externalKey in URL', async () => {
			mockFetch.mockResolvedValue(
				jsonResponse({ fields: { status: { name: 'Done', statusCategory: { key: 'done' } } } })
			);

			await fetchJiraIssueStatus(baseConfig, 'PROJ-42/special');
			expect(mockFetch.mock.calls[0][0]).toContain('PROJ-42%2Fspecial');
		});

		it('throws on non-ok response', async () => {
			mockFetch.mockResolvedValue(new Response('Not Found', { status: 404 }));
			await expect(fetchJiraIssueStatus(baseConfig, 'PROJ-999')).rejects.toThrow('Jira returned 404');
		});
	});
});
