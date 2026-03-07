import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { authenticateApiKey } from '$lib/server/api-key-auth';
import { childLogger } from '$lib/server/logger';

const log = childLogger('webhook');

interface GitHubWorkflowPayload {
	action: string;
	workflow_run?: {
		id: number;
		name: string;
		head_branch: string;
		head_sha: string;
		status: string;
		conclusion: string | null;
		html_url: string;
		repository?: {
			full_name: string;
		};
	};
	repository?: {
		full_name: string;
	};
}

interface GitLabPipelinePayload {
	object_kind: string;
	object_attributes?: {
		id: number;
		ref: string;
		sha: string;
		status: string;
		url?: string;
	};
	project?: {
		path_with_namespace: string;
		web_url?: string;
	};
}

export const POST: RequestHandler = async ({ request }) => {
	// Authenticate via API key
	const auth = await authenticateApiKey(request);
	if (!auth) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}
	const { projectId } = auth;

	const githubEvent = request.headers.get('x-github-event');
	const gitlabEvent = request.headers.get('x-gitlab-event');

	let platform: 'github' | 'gitlab' | 'unknown' = 'unknown';
	let repo: string | null = null;
	let branch: string | null = null;
	let commitSha: string | null = null;
	let buildStatus: string | null = null;
	let buildUrl: string | null = null;
	let isCompleted = false;
	let message = 'Webhook received';

	const contentLength = Number(request.headers.get('content-length') ?? 0);
	if (contentLength > 1024 * 1024) {
		return json({ error: 'Request body must not exceed 1MB' }, { status: 413 });
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid request body' }, { status: 400 });
	}

	if (githubEvent) {
		platform = 'github';
		const payload = body as GitHubWorkflowPayload;

		if (githubEvent === 'workflow_run' && payload.workflow_run) {
			const wr = payload.workflow_run;
			repo = payload.repository?.full_name ?? wr.repository?.full_name ?? null;
			branch = wr.head_branch;
			commitSha = wr.head_sha;
			buildStatus = wr.conclusion ?? wr.status;
			buildUrl = wr.html_url;
			isCompleted = wr.status === 'completed';
			message = isCompleted
				? `GitHub workflow "${wr.name}" completed with status: ${wr.conclusion}`
				: `GitHub workflow "${wr.name}" is ${wr.status}`;
		} else if (githubEvent === 'ping') {
			return json({ received: true, message: 'Ping acknowledged' });
		} else {
			return json({ received: true, message: `GitHub event "${githubEvent}" acknowledged` });
		}
	} else if (gitlabEvent) {
		platform = 'gitlab';
		const payload = body as GitLabPipelinePayload;

		if (gitlabEvent === 'Pipeline Hook' && payload.object_attributes) {
			const oa = payload.object_attributes;
			repo = payload.project?.path_with_namespace ?? null;
			branch = oa.ref;
			commitSha = oa.sha;
			buildStatus = oa.status;
			buildUrl = oa.url ?? payload.project?.web_url ?? null;
			isCompleted = oa.status === 'success' || oa.status === 'failed' || oa.status === 'canceled';
			message = isCompleted
				? `GitLab pipeline completed with status: ${oa.status}`
				: `GitLab pipeline is ${oa.status}`;
		} else {
			return json({ received: true, message: `GitLab event "${gitlabEvent}" acknowledged` });
		}
	} else {
		// Unknown webhook source — accept and acknowledge
		return json({
			received: true,
			message: 'Webhook received. Use X-GitHub-Event or X-Gitlab-Event header for platform detection.'
		});
	}

	// Log webhook metadata (audit trail — can be extended to DB)
	log.info({
		platform,
		projectId,
		repo,
		branch,
		commitSha,
		buildStatus,
		buildUrl,
		isCompleted,
		receivedAt: new Date().toISOString()
	}, 'Webhook received');

	return json({
		received: true,
		message,
		meta: {
			platform,
			repo,
			branch,
			commitSha: commitSha?.slice(0, 8),
			buildStatus,
			isCompleted
		}
	});
};
