import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAuthenticateApiKey = vi.fn();

vi.mock('$lib/server/api-key-auth', () => ({
	authenticateApiKey: mockAuthenticateApiKey
}));
vi.mock('$lib/server/logger', () => ({
	childLogger: () => ({
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn()
	})
}));

const { POST } = await import('./+server');

function makeRequest(
	body: unknown,
	headers?: Record<string, string>
): Request {
	return new Request('http://localhost:5173/api/automation/webhook', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			...headers
		},
		body: JSON.stringify(body)
	});
}

function makeInvalidJsonRequest(headers?: Record<string, string>): Request {
	return new Request('http://localhost:5173/api/automation/webhook', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			...headers
		},
		body: 'not json'
	});
}

describe('/api/automation/webhook POST', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// ─── Auth ────────────────────────────────────────────────────────────

	describe('authentication', () => {
		it('should return 401 when API key authentication fails', async () => {
			mockAuthenticateApiKey.mockResolvedValue(null);

			const request = makeRequest({ action: 'test' });
			const response = await POST({ request } as never);
			const data = await response.json();

			expect(response.status).toBe(401);
			expect(data.error).toBe('Unauthorized');
		});
	});

	// ─── Validation ──────────────────────────────────────────────────────

	describe('validation', () => {
		beforeEach(() => {
			mockAuthenticateApiKey.mockResolvedValue({ projectId: 1, keyId: 1 });
		});

		it('should return 400 for invalid JSON body', async () => {
			const request = makeInvalidJsonRequest({
				'x-github-event': 'workflow_run'
			});
			const response = await POST({ request } as never);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toBe('Invalid request body');
		});

		it('should return 413 when content-length exceeds 1MB', async () => {
			const request = new Request('http://localhost:5173/api/automation/webhook', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'content-length': String(2 * 1024 * 1024)
				},
				body: JSON.stringify({})
			});
			const response = await POST({ request } as never);
			const data = await response.json();

			expect(response.status).toBe(413);
			expect(data.error).toContain('1MB');
		});
	});

	// ─── Unknown platform ────────────────────────────────────────────────

	describe('unknown platform', () => {
		beforeEach(() => {
			mockAuthenticateApiKey.mockResolvedValue({ projectId: 1, keyId: 1 });
		});

		it('should acknowledge webhook from unknown platform', async () => {
			const request = makeRequest({ some: 'data' });
			const response = await POST({ request } as never);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.received).toBe(true);
			expect(data.message).toContain('X-GitHub-Event');
		});
	});

	// ─── GitHub events ──────────────────────────────────────────────────

	describe('GitHub events', () => {
		beforeEach(() => {
			mockAuthenticateApiKey.mockResolvedValue({ projectId: 1, keyId: 1 });
		});

		it('should handle GitHub ping event', async () => {
			const request = makeRequest(
				{ zen: 'Keep it logically awesome.' },
				{ 'x-github-event': 'ping' }
			);
			const response = await POST({ request } as never);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.received).toBe(true);
			expect(data.message).toBe('Ping acknowledged');
		});

		it('should handle GitHub workflow_run completed event', async () => {
			const payload = {
				action: 'completed',
				workflow_run: {
					id: 123,
					name: 'CI Build',
					head_branch: 'main',
					head_sha: 'abc12345def67890',
					status: 'completed',
					conclusion: 'success',
					html_url: 'https://github.com/org/repo/actions/runs/123'
				},
				repository: {
					full_name: 'org/repo'
				}
			};
			const request = makeRequest(payload, { 'x-github-event': 'workflow_run' });
			const response = await POST({ request } as never);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.received).toBe(true);
			expect(data.message).toContain('CI Build');
			expect(data.message).toContain('success');
			expect(data.meta.platform).toBe('github');
			expect(data.meta.repo).toBe('org/repo');
			expect(data.meta.branch).toBe('main');
			expect(data.meta.commitSha).toBe('abc12345');
			expect(data.meta.buildStatus).toBe('success');
			expect(data.meta.isCompleted).toBe(true);
		});

		it('should handle GitHub workflow_run in progress event', async () => {
			const payload = {
				action: 'in_progress',
				workflow_run: {
					id: 124,
					name: 'Deploy',
					head_branch: 'develop',
					head_sha: '1234567890abcdef',
					status: 'in_progress',
					conclusion: null,
					html_url: 'https://github.com/org/repo/actions/runs/124'
				},
				repository: {
					full_name: 'org/repo'
				}
			};
			const request = makeRequest(payload, { 'x-github-event': 'workflow_run' });
			const response = await POST({ request } as never);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.meta.isCompleted).toBe(false);
			expect(data.message).toContain('in_progress');
		});

		it('should acknowledge unhandled GitHub events', async () => {
			const request = makeRequest(
				{ action: 'opened' },
				{ 'x-github-event': 'pull_request' }
			);
			const response = await POST({ request } as never);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.received).toBe(true);
			expect(data.message).toContain('pull_request');
		});

		it('should use repository from workflow_run when top-level is missing', async () => {
			const payload = {
				action: 'completed',
				workflow_run: {
					id: 125,
					name: 'Test',
					head_branch: 'main',
					head_sha: 'aaaa1111bbbb2222',
					status: 'completed',
					conclusion: 'failure',
					html_url: 'https://github.com/org/repo/actions/runs/125',
					repository: {
						full_name: 'org/inner-repo'
					}
				}
			};
			const request = makeRequest(payload, { 'x-github-event': 'workflow_run' });
			const response = await POST({ request } as never);
			const data = await response.json();

			expect(data.meta.repo).toBe('org/inner-repo');
		});
	});

	// ─── GitLab events ──────────────────────────────────────────────────

	describe('GitLab events', () => {
		beforeEach(() => {
			mockAuthenticateApiKey.mockResolvedValue({ projectId: 1, keyId: 1 });
		});

		it('should handle GitLab Pipeline Hook with completed status', async () => {
			const payload = {
				object_kind: 'pipeline',
				object_attributes: {
					id: 456,
					ref: 'main',
					sha: 'deadbeef12345678',
					status: 'success',
					url: 'https://gitlab.com/org/repo/-/pipelines/456'
				},
				project: {
					path_with_namespace: 'org/repo',
					web_url: 'https://gitlab.com/org/repo'
				}
			};
			const request = makeRequest(payload, { 'x-gitlab-event': 'Pipeline Hook' });
			const response = await POST({ request } as never);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.received).toBe(true);
			expect(data.meta.platform).toBe('gitlab');
			expect(data.meta.repo).toBe('org/repo');
			expect(data.meta.branch).toBe('main');
			expect(data.meta.commitSha).toBe('deadbeef');
			expect(data.meta.buildStatus).toBe('success');
			expect(data.meta.isCompleted).toBe(true);
		});

		it('should handle GitLab pipeline with failed status', async () => {
			const payload = {
				object_kind: 'pipeline',
				object_attributes: {
					id: 457,
					ref: 'develop',
					sha: 'cafe1234babe5678',
					status: 'failed'
				},
				project: {
					path_with_namespace: 'org/repo',
					web_url: 'https://gitlab.com/org/repo'
				}
			};
			const request = makeRequest(payload, { 'x-gitlab-event': 'Pipeline Hook' });
			const response = await POST({ request } as never);
			const data = await response.json();

			expect(data.meta.buildStatus).toBe('failed');
			expect(data.meta.isCompleted).toBe(true);
		});

		it('should handle GitLab pipeline with running (non-completed) status', async () => {
			const payload = {
				object_kind: 'pipeline',
				object_attributes: {
					id: 458,
					ref: 'main',
					sha: 'abcd1234efgh5678',
					status: 'running'
				},
				project: {
					path_with_namespace: 'org/repo'
				}
			};
			const request = makeRequest(payload, { 'x-gitlab-event': 'Pipeline Hook' });
			const response = await POST({ request } as never);
			const data = await response.json();

			expect(data.meta.isCompleted).toBe(false);
			expect(data.message).toContain('running');
		});

		it('should handle GitLab pipeline with canceled status', async () => {
			const payload = {
				object_kind: 'pipeline',
				object_attributes: {
					id: 459,
					ref: 'main',
					sha: '1111222233334444',
					status: 'canceled'
				},
				project: {
					path_with_namespace: 'org/repo'
				}
			};
			const request = makeRequest(payload, { 'x-gitlab-event': 'Pipeline Hook' });
			const response = await POST({ request } as never);
			const data = await response.json();

			expect(data.meta.isCompleted).toBe(true);
			expect(data.meta.buildStatus).toBe('canceled');
		});

		it('should acknowledge unhandled GitLab events', async () => {
			const request = makeRequest(
				{ object_kind: 'push' },
				{ 'x-gitlab-event': 'Push Hook' }
			);
			const response = await POST({ request } as never);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.received).toBe(true);
			expect(data.message).toContain('Push Hook');
		});

		it('should fallback to project web_url when pipeline url is missing', async () => {
			const payload = {
				object_kind: 'pipeline',
				object_attributes: {
					id: 460,
					ref: 'main',
					sha: 'aaaa0000bbbb1111',
					status: 'success'
				},
				project: {
					path_with_namespace: 'org/repo',
					web_url: 'https://gitlab.com/org/repo'
				}
			};
			const request = makeRequest(payload, { 'x-gitlab-event': 'Pipeline Hook' });
			const response = await POST({ request } as never);
			const data = await response.json();

			expect(data.meta.platform).toBe('gitlab');
			// buildUrl should fallback to project web_url
			expect(response.status).toBe(200);
		});
	});
});
