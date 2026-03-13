import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { issueLink, issueTrackerConfig } from '$lib/server/db/schema';
import { and, eq } from 'drizzle-orm';
import { withProjectRole } from '$lib/server/api-handler';
import { notFound, badRequest } from '$lib/server/errors';
import { addIssueComment } from '$lib/server/issue-tracker';
import { parseJsonBody } from '$lib/server/auth-utils';

export const POST = withProjectRole(
	['PROJECT_ADMIN', 'QA', 'DEV'],
	async ({ request, projectId, params }) => {
		const linkId = Number(params.linkId);
		if (!Number.isFinite(linkId)) error(400, 'Invalid link ID');

		let body: { comment?: string };
		try {
			body = (await parseJsonBody(request)) as typeof body;
		} catch {
			error(400, 'Invalid request body');
		}

		const comment = (body.comment ?? '').trim();
		if (!comment) return badRequest('Comment is required');

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
