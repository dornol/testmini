import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import {
	unauthorized,
	badRequest,
	payloadTooLarge,
	MAX_WEBHOOK_BODY_SIZE
} from '$lib/server/errors';
import { authenticateApiKey } from '$lib/server/api-key-auth';
import { childLogger } from '$lib/server/logger';
import { parseJsonBody } from '$lib/server/auth-utils';

const log = childLogger('webhook');
const MAX_EVENT_NAME_LENGTH = 100;
const MAX_META_STRING_LENGTH = 500;
const MAX_SHA_LENGTH = 128;

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

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}

function safeString(value: unknown, field: string, maxLength = MAX_META_STRING_LENGTH): string {
	if (typeof value !== 'string' || !value.trim()) {
		throw new Error(`${field} must be a non-empty string`);
	}
	const trimmed = value.trim();
	if (trimmed.length > maxLength) {
		throw new Error(`${field} is too long`);
	}
	return trimmed;
}

function safeOptionalString(
	value: unknown,
	field: string,
	maxLength = MAX_META_STRING_LENGTH
): string | null {
	if (value === undefined || value === null) return null;
	return safeString(value, field, maxLength);
}

function validateEventName(value: string | null, field: string): string | null {
	if (value === null) return null;
	if (!value.trim() || value.length > MAX_EVENT_NAME_LENGTH) {
		throw new Error(`${field} is invalid`);
	}
	return value;
}

export const POST: RequestHandler = async ({ request }) => {
	// Authenticate via API key
	const auth = await authenticateApiKey(request);
	if (!auth) {
		return unauthorized('Unauthorized');
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
	if (contentLength > MAX_WEBHOOK_BODY_SIZE) {
		return payloadTooLarge();
	}

	let body: unknown;
	try {
		body = await parseJsonBody(request);
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err && err.status === 413) {
			return payloadTooLarge();
		}
		return badRequest('Invalid request body');
	}
	if (!isRecord(body)) {
		return badRequest('Invalid request body');
	}

	try {
		validateEventName(githubEvent, 'x-github-event');
		validateEventName(gitlabEvent, 'x-gitlab-event');
	} catch {
		return badRequest('Invalid webhook event header');
	}

	if (githubEvent) {
		platform = 'github';
		const payload = body as unknown as GitHubWorkflowPayload;

		if (githubEvent === 'workflow_run' && payload.workflow_run) {
			const wr = payload.workflow_run;
			let workflowName: string;
			let status: string;
			try {
				workflowName = safeString(wr.name, 'workflow_run.name');
				repo = safeOptionalString(
					payload.repository?.full_name ?? wr.repository?.full_name,
					'repository.full_name'
				);
				branch = safeString(wr.head_branch, 'workflow_run.head_branch');
				commitSha = safeString(wr.head_sha, 'workflow_run.head_sha', MAX_SHA_LENGTH);
				status = safeString(wr.status, 'workflow_run.status');
				const conclusion =
					wr.conclusion === null
						? null
						: safeOptionalString(wr.conclusion, 'workflow_run.conclusion');
				buildStatus = conclusion ?? status;
				buildUrl = safeString(wr.html_url, 'workflow_run.html_url', 2_000);
				isCompleted = status === 'completed';
			} catch (err) {
				log.warn({ err, projectId }, 'Invalid GitHub workflow_run payload');
				return badRequest('Invalid GitHub workflow_run payload');
			}
			message = isCompleted
				? `GitHub workflow "${workflowName}" completed with status: ${buildStatus}`
				: `GitHub workflow "${workflowName}" is ${status}`;
		} else if (githubEvent === 'ping') {
			return json({ received: true, message: 'Ping acknowledged' });
		} else {
			return json({ received: true, message: `GitHub event "${githubEvent}" acknowledged` });
		}
	} else if (gitlabEvent) {
		platform = 'gitlab';
		const payload = body as unknown as GitLabPipelinePayload;

		if (gitlabEvent === 'Pipeline Hook' && payload.object_attributes) {
			const oa = payload.object_attributes;
			try {
				repo = safeOptionalString(
					payload.project?.path_with_namespace,
					'project.path_with_namespace'
				);
				branch = safeString(oa.ref, 'object_attributes.ref');
				commitSha = safeString(oa.sha, 'object_attributes.sha', MAX_SHA_LENGTH);
				buildStatus = safeString(oa.status, 'object_attributes.status');
				buildUrl = safeOptionalString(
					oa.url ?? payload.project?.web_url,
					'object_attributes.url',
					2_000
				);
				isCompleted =
					buildStatus === 'success' || buildStatus === 'failed' || buildStatus === 'canceled';
			} catch (err) {
				log.warn({ err, projectId }, 'Invalid GitLab pipeline payload');
				return badRequest('Invalid GitLab pipeline payload');
			}
			message = isCompleted
				? `GitLab pipeline completed with status: ${buildStatus}`
				: `GitLab pipeline is ${buildStatus}`;
		} else {
			return json({ received: true, message: `GitLab event "${gitlabEvent}" acknowledged` });
		}
	} else {
		// Unknown webhook source — accept and acknowledge
		return json({
			received: true,
			message:
				'Webhook received. Use X-GitHub-Event or X-Gitlab-Event header for platform detection.'
		});
	}

	// Log webhook metadata (audit trail — can be extended to DB)
	log.info(
		{
			platform,
			projectId,
			repo,
			branch,
			commitSha,
			buildStatus,
			buildUrl,
			isCompleted,
			receivedAt: new Date().toISOString()
		},
		'Webhook received'
	);

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
