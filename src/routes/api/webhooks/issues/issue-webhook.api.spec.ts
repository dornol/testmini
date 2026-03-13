import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockSelectResult } from '$lib/server/test-helpers/mock-db';
import crypto from 'node:crypto';

// ── Mocks ────────────────────────────────────────────────

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));

vi.mock('$lib/server/db/schema', () => ({
	issueLink: {
		id: 'id',
		projectId: 'project_id',
		provider: 'provider',
		externalUrl: 'external_url',
		externalKey: 'external_key',
		status: 'status',
		statusSyncedAt: 'status_synced_at',
		testCaseId: 'test_case_id'
	},
	issueTrackerConfig: {
		provider: 'provider',
		projectKey: 'project_key',
		enabled: 'enabled',
		webhookSecret: 'webhook_secret'
	},
	testCase: { id: 'id', retestNeeded: 'retest_needed' }
}));

vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a, b) => [a, b]),
	and: vi.fn((...args) => args),
	or: vi.fn((...args) => ['or', ...args]),
	inArray: vi.fn((a, b) => [a, b])
}));

vi.mock('$lib/server/logger', () => ({
	childLogger: () => ({
		info: vi.fn(),
		warn: vi.fn(),
		debug: vi.fn(),
		error: vi.fn()
	})
}));

// Import after mocks
const { POST } = await import('./+server');

// ── Helpers ──────────────────────────────────────────────

function createWebhookRequest(
	body: unknown,
	headers: Record<string, string> = {}
): Parameters<typeof POST>[0] {
	const bodyStr = JSON.stringify(body);
	const request = new Request('http://localhost/api/webhooks/issues', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', ...headers },
		body: bodyStr
	});
	return {
		request,
		url: new URL('http://localhost/api/webhooks/issues'),
		params: {},
		locals: {},
		cookies: {
			get: () => undefined,
			set: () => {},
			delete: () => {},
			getAll: () => [],
			serialize: () => ''
		},
		getClientAddress: () => '127.0.0.1',
		platform: undefined,
		route: { id: '' },
		isDataRequest: false,
		isSubRequest: false,
		fetch: globalThis.fetch
	} as never;
}

function makeGitHubIssuePayload(
	overrides: {
		action?: string;
		state?: string;
		number?: number;
		repoFullName?: string;
		htmlUrl?: string;
	} = {}
) {
	const {
		action = 'opened',
		state = 'open',
		number = 42,
		repoFullName = 'owner/repo',
		htmlUrl = 'https://github.com/owner/repo/issues/42'
	} = overrides;
	return {
		action,
		issue: { number, state, title: 'Test issue', html_url: htmlUrl },
		repository: { full_name: repoFullName }
	};
}

function makeGitLabIssuePayload(
	overrides: {
		action?: string;
		state?: string;
		iid?: number;
		projectId?: number;
		pathWithNamespace?: string;
	} = {}
) {
	const {
		action = 'open',
		state = 'opened',
		iid = 10,
		projectId = 999,
		pathWithNamespace = 'group/project'
	} = overrides;
	return {
		object_kind: 'issue' as const,
		object_attributes: {
			iid,
			state,
			title: 'GL Issue',
			url: `https://gitlab.com/${pathWithNamespace}/-/issues/${iid}`,
			action
		},
		project: {
			id: projectId,
			path_with_namespace: pathWithNamespace,
			web_url: `https://gitlab.com/${pathWithNamespace}`
		}
	};
}

function makeGiteaIssuePayload(
	overrides: {
		action?: string;
		state?: string;
		number?: number;
		repoFullName?: string;
	} = {}
) {
	const {
		action = 'opened',
		state = 'open',
		number = 7,
		repoFullName = 'org/myrepo'
	} = overrides;
	return {
		action,
		number,
		issue: {
			number,
			state,
			title: 'Gitea issue',
			html_url: `https://gitea.example.com/${repoFullName}/issues/${number}`
		},
		repository: { full_name: repoFullName }
	};
}

function makeConfig(overrides: Record<string, unknown> = {}) {
	return {
		projectId: 1,
		provider: 'GITHUB',
		projectKey: 'owner/repo',
		enabled: true,
		webhookSecret: null,
		...overrides
	};
}

function makeIssueLink(overrides: Record<string, unknown> = {}) {
	return {
		id: 100,
		projectId: 1,
		provider: 'GITHUB',
		externalUrl: 'https://github.com/owner/repo/issues/42',
		externalKey: '#42',
		status: 'open',
		statusSyncedAt: null,
		testCaseId: 10,
		...overrides
	};
}

/** Helper to set up config select → link select → update chain in sequence */
function setupDbChain(configs: unknown[], links: unknown[] = []) {
	let selectCall = 0;
	mockDb.select.mockImplementation(() => {
		const call = selectCall++;
		if (call === 0) {
			// First select: configs
			return chainResolving(configs);
		}
		// Subsequent selects: links
		return chainResolving(links);
	});
}

function chainResolving(result: unknown[]) {
	const chain: Record<string, unknown> = {};
	const methods = [
		'from',
		'where',
		'orderBy',
		'limit',
		'offset',
		'innerJoin',
		'leftJoin',
		'groupBy',
		'set',
		'values',
		'returning'
	];
	for (const m of methods) {
		chain[m] = vi.fn().mockReturnValue(chain);
	}
	chain.then = (resolve: (v: unknown) => void) => Promise.resolve(result).then(resolve);
	return chain;
}

function computeGitHubSignature(secret: string, body: string): string {
	const hmac = crypto.createHmac('sha256', secret).update(body).digest('hex');
	return `sha256=${hmac}`;
}

function computeGiteaSignature(secret: string, body: string): string {
	return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

// ── Tests ────────────────────────────────────────────────

describe('/api/webhooks/issues POST', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// ── Basic handling ──────────────────────────────────

	describe('basic handling', () => {
		it('returns 400 on invalid JSON body', async () => {
			const request = new Request('http://localhost/api/webhooks/issues', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: 'not-json{'
			});
			const event = {
				request,
				url: new URL('http://localhost/api/webhooks/issues'),
				params: {},
				locals: {}
			} as never;

			const response = await POST(event);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toBe('Invalid JSON');
		});

		it('returns 413 when body exceeds 1MB', async () => {
			const request = new Request('http://localhost/api/webhooks/issues', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'content-length': '1048577'
				},
				body: '{}'
			});
			const event = {
				request,
				url: new URL('http://localhost/api/webhooks/issues'),
				params: {},
				locals: {}
			} as never;

			const response = await POST(event);
			const data = await response.json();

			expect(response.status).toBe(413);
			expect(data.error).toBe('Request body must not exceed 1MB');
		});

		it('acknowledges GitHub ping event', async () => {
			const event = createWebhookRequest(
				{ zen: 'Keep it simple' },
				{ 'x-github-event': 'ping' }
			);

			const response = await POST(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.received).toBe(true);
			expect(data.message).toBe('Ping acknowledged');
		});

		it('returns "Event type not handled" for unrecognized events', async () => {
			const event = createWebhookRequest(
				{ action: 'completed' },
				{ 'x-github-event': 'push' }
			);

			const response = await POST(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.received).toBe(true);
			expect(data.message).toBe('Event type not handled');
		});
	});

	// ── GitHub issues ───────────────────────────────────

	describe('GitHub issues', () => {
		it('processes opened event and updates matching issue links', async () => {
			const config = makeConfig();
			const link = makeIssueLink();
			setupDbChain([config], [link]);

			const event = createWebhookRequest(makeGitHubIssuePayload(), {
				'x-github-event': 'issues'
			});

			const response = await POST(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.received).toBe(true);
			expect(data.updated).toBe(1);
			// update was called for issueLink status
			expect(mockDb.update).toHaveBeenCalled();
		});

		it('returns matched:0 when no config matches repo', async () => {
			setupDbChain([]);

			const event = createWebhookRequest(
				makeGitHubIssuePayload({ repoFullName: 'unknown/repo' }),
				{ 'x-github-event': 'issues' }
			);

			const response = await POST(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.matched).toBe(0);
		});

		it('updates issueLink status to closed when issue closed', async () => {
			const config = makeConfig();
			const link = makeIssueLink({ testCaseId: 20 });
			setupDbChain([config], [link]);

			const event = createWebhookRequest(
				makeGitHubIssuePayload({ action: 'closed', state: 'closed' }),
				{ 'x-github-event': 'issues' }
			);

			const response = await POST(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.updated).toBe(1);
			expect(data.retestMarked).toBe(1);
		});
	});

	// ── GitLab issues ───────────────────────────────────

	describe('GitLab issues', () => {
		it('processes GitLab Issue Hook event', async () => {
			const config = makeConfig({
				provider: 'GITLAB',
				projectKey: '999'
			});
			const link = makeIssueLink({
				provider: 'GITLAB',
				externalUrl: 'https://gitlab.com/group/project/-/issues/10',
				externalKey: '#10'
			});
			setupDbChain([config], [link]);

			const event = createWebhookRequest(makeGitLabIssuePayload(), {
				'x-gitlab-event': 'Issue Hook'
			});

			const response = await POST(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.received).toBe(true);
			expect(data.updated).toBe(1);
		});
	});

	// ── Gitea issues ────────────────────────────────────

	describe('Gitea issues', () => {
		it('processes Gitea issue event', async () => {
			const config = makeConfig({
				provider: 'GITEA',
				projectKey: 'org/myrepo'
			});
			const link = makeIssueLink({
				provider: 'GITEA',
				externalUrl: 'https://gitea.example.com/org/myrepo/issues/7',
				externalKey: '#7'
			});
			setupDbChain([config], [link]);

			const event = createWebhookRequest(makeGiteaIssuePayload(), {
				'x-gitea-event': 'issues'
			});

			const response = await POST(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.received).toBe(true);
			expect(data.updated).toBe(1);
		});
	});

	// ── Signature verification ──────────────────────────

	describe('signature verification', () => {
		it('skips config with invalid GitHub signature', async () => {
			const config = makeConfig({ webhookSecret: 'my-secret' });
			setupDbChain([config], []);

			const event = createWebhookRequest(makeGitHubIssuePayload(), {
				'x-github-event': 'issues',
				'x-hub-signature-256': 'sha256=invalidsignature0000000000000000000000000000000000000000000000'
			});

			const response = await POST(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			// Config was skipped due to invalid signature, so no links matched
			expect(data.updated).toBe(0);
		});

		it('accepts valid GitHub HMAC-SHA256 signature', async () => {
			const secret = 'gh-webhook-secret';
			const payload = makeGitHubIssuePayload();
			const bodyStr = JSON.stringify(payload);
			const signature = computeGitHubSignature(secret, bodyStr);

			const config = makeConfig({ webhookSecret: secret });
			const link = makeIssueLink();
			setupDbChain([config], [link]);

			const event = createWebhookRequest(payload, {
				'x-github-event': 'issues',
				'x-hub-signature-256': signature
			});

			const response = await POST(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.updated).toBe(1);
		});

		it('skips config with invalid GitLab token', async () => {
			const config = makeConfig({
				provider: 'GITLAB',
				projectKey: '999',
				webhookSecret: 'correct-token'
			});
			setupDbChain([config], []);

			const event = createWebhookRequest(makeGitLabIssuePayload(), {
				'x-gitlab-event': 'Issue Hook',
				'x-gitlab-token': 'wrong-token'
			});

			const response = await POST(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.updated).toBe(0);
		});

		it('accepts valid GitLab token', async () => {
			const secret = 'gitlab-secret-token';
			const config = makeConfig({
				provider: 'GITLAB',
				projectKey: '999',
				webhookSecret: secret
			});
			const link = makeIssueLink({
				provider: 'GITLAB',
				externalUrl: 'https://gitlab.com/group/project/-/issues/10',
				externalKey: '#10'
			});
			setupDbChain([config], [link]);

			const event = createWebhookRequest(makeGitLabIssuePayload(), {
				'x-gitlab-event': 'Issue Hook',
				'x-gitlab-token': secret
			});

			const response = await POST(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.updated).toBe(1);
		});

		it('skips config with invalid Gitea signature', async () => {
			const config = makeConfig({
				provider: 'GITEA',
				projectKey: 'org/myrepo',
				webhookSecret: 'gitea-secret'
			});
			setupDbChain([config], []);

			const event = createWebhookRequest(makeGiteaIssuePayload(), {
				'x-gitea-event': 'issues',
				'x-gitea-signature': 'invalidsignature0000000000000000000000000000000000000000000000abcd'
			});

			const response = await POST(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.updated).toBe(0);
		});

		it('accepts valid Gitea HMAC-SHA256 signature', async () => {
			const secret = 'gitea-secret';
			const payload = makeGiteaIssuePayload();
			const bodyStr = JSON.stringify(payload);
			const signature = computeGiteaSignature(secret, bodyStr);

			const config = makeConfig({
				provider: 'GITEA',
				projectKey: 'org/myrepo',
				webhookSecret: secret
			});
			const link = makeIssueLink({
				provider: 'GITEA',
				externalUrl: 'https://gitea.example.com/org/myrepo/issues/7',
				externalKey: '#7'
			});
			setupDbChain([config], [link]);

			const event = createWebhookRequest(payload, {
				'x-gitea-event': 'issues',
				'x-gitea-signature': signature
			});

			const response = await POST(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.updated).toBe(1);
		});
	});

	// ── Retest marking ──────────────────────────────────

	describe('retest marking', () => {
		it('sets retestNeeded=true when issue is closed', async () => {
			const config = makeConfig();
			const link = makeIssueLink({ testCaseId: 55 });
			setupDbChain([config], [link]);

			const event = createWebhookRequest(
				makeGitHubIssuePayload({ action: 'closed', state: 'closed' }),
				{ 'x-github-event': 'issues' }
			);

			const response = await POST(event);
			const data = await response.json();

			expect(data.retestMarked).toBe(1);
			// update should have been called twice: once for issueLink, once for testCase
			expect(mockDb.update).toHaveBeenCalledTimes(2);
		});

		it('does NOT set retestNeeded when issue is opened', async () => {
			const config = makeConfig();
			const link = makeIssueLink({ testCaseId: 55 });
			setupDbChain([config], [link]);

			const event = createWebhookRequest(
				makeGitHubIssuePayload({ action: 'opened', state: 'open' }),
				{ 'x-github-event': 'issues' }
			);

			const response = await POST(event);
			const data = await response.json();

			expect(data.retestMarked).toBe(0);
			// update called only once: for issueLink status, not for testCase
			expect(mockDb.update).toHaveBeenCalledTimes(1);
		});
	});

	// ── Edge cases ──────────────────────────────────────

	describe('edge cases', () => {
		it('handles multiple configs matching the same repo', async () => {
			const configs = [
				makeConfig({ projectId: 1 }),
				makeConfig({ projectId: 2 })
			];
			const link1 = makeIssueLink({ id: 100, projectId: 1, testCaseId: 10 });
			const link2 = makeIssueLink({ id: 200, projectId: 2, testCaseId: 20 });

			let selectCall = 0;
			mockDb.select.mockImplementation(() => {
				const call = selectCall++;
				if (call === 0) return chainResolving(configs);
				if (call === 1) return chainResolving([link1]);
				return chainResolving([link2]);
			});

			const event = createWebhookRequest(
				makeGitHubIssuePayload({ action: 'closed', state: 'closed' }),
				{ 'x-github-event': 'issues' }
			);

			const response = await POST(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.updated).toBe(2);
			expect(data.retestMarked).toBe(2);
		});

		it('no-ops gracefully when no issue links match', async () => {
			const config = makeConfig();
			setupDbChain([config], []);

			const event = createWebhookRequest(makeGitHubIssuePayload(), {
				'x-github-event': 'issues'
			});

			const response = await POST(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.updated).toBe(0);
			expect(data.retestMarked).toBe(0);
		});

		it('handles issue links without testCaseId on close (no retest)', async () => {
			const config = makeConfig();
			const link = makeIssueLink({ testCaseId: null });
			setupDbChain([config], [link]);

			const event = createWebhookRequest(
				makeGitHubIssuePayload({ action: 'closed', state: 'closed' }),
				{ 'x-github-event': 'issues' }
			);

			const response = await POST(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.updated).toBe(1);
			expect(data.retestMarked).toBe(0);
		});
	});
});
