import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { issueLink, issueTrackerConfig } from '$lib/server/db/schema';
import { and, eq } from 'drizzle-orm';
import { withProjectRole } from '$lib/server/api-handler';
import { notFound, badRequest } from '$lib/server/errors';
import { addIssueComment } from '$lib/server/issue-tracker';
import { parseJsonBody, parseId } from '$lib/server/auth-utils';

const MAX_COMMENT_LENGTH = 10000;

function validateRequestBody(body: unknown): Record<string, unknown> | Response {
	if (!body || typeof body !== 'object' || Array.isArray(body)) {
		return badRequest('Invalid request body');
	}
	return body as Record<string, unknown>;
}

function validateComment(value: unknown): string | Response {
	if (typeof value !== 'string') {
		return badRequest('Comment is required');
	}
	const comment = value.trim();
	if (!comment) return badRequest('Comment is required');
	if (comment.length > MAX_COMMENT_LENGTH) {
		return badRequest(`Comment must be ${MAX_COMMENT_LENGTH} characters or less`);
	}
	return comment;
}

export const POST = withProjectRole(
	['PROJECT_ADMIN', 'QA', 'DEV'],
	async ({ request, projectId, params }) => {
		const linkId = parseId(params.linkId, 'link ID');

		let rawBody: unknown;
		try {
			rawBody = await parseJsonBody(request);
		} catch {
			error(400, 'Invalid request body');
		}

		const bodyOrError = validateRequestBody(rawBody);
		if (bodyOrError instanceof Response) return bodyOrError;

		const commentOrError = validateComment(bodyOrError.comment);
		if (commentOrError instanceof Response) return commentOrError;
		const comment = commentOrError;

		const link = await db.query.issueLink.findFirst({
			where: and(eq(issueLink.id, linkId), eq(issueLink.projectId, projectId))
		});
		if (!link) return notFound('Issue link not found');

		const config = await db.query.issueTrackerConfig.findFirst({
			where: eq(issueTrackerConfig.projectId, projectId)
		});
		if (!config) return notFound('Issue tracker not configured');

		await addIssueComment(
			{
				provider: config.provider,
				baseUrl: config.baseUrl,
				apiToken: config.apiToken,
				projectKey: config.projectKey,
				customTemplate: config.customTemplate as Record<string, unknown> | null
			},
			link.externalUrl,
			comment
		);

		return json({ success: true });
	}
);
