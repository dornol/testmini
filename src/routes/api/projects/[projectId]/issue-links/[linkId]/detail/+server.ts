import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { issueLink, issueTrackerConfig } from '$lib/server/db/schema';
import { and, eq } from 'drizzle-orm';
import { withProjectAccess } from '$lib/server/api-handler';
import { notFound, badRequest } from '$lib/server/errors';
import { fetchIssueDetail } from '$lib/server/issue-tracker';

export const GET = withProjectAccess(async ({ projectId, params }) => {
	const linkId = Number(params.linkId);
	if (!Number.isFinite(linkId)) error(400, 'Invalid link ID');

	const link = await db.query.issueLink.findFirst({
		where: and(eq(issueLink.id, linkId), eq(issueLink.projectId, projectId))
	});
	if (!link) return notFound('Issue link not found');

	if (link.provider === 'CUSTOM') {
		return badRequest('Detail view is not available for custom providers');
	}

	const config = await db.query.issueTrackerConfig.findFirst({
		where: eq(issueTrackerConfig.projectId, projectId)
	});
	if (!config) return notFound('Issue tracker not configured');

	const detail = await fetchIssueDetail(
		{
			provider: config.provider,
			baseUrl: config.baseUrl,
			apiToken: config.apiToken,
			projectKey: config.projectKey,
			customTemplate: config.customTemplate as Record<string, unknown> | null
		},
		link.externalUrl
	);

	if (!detail) {
		return badRequest('Could not fetch issue detail for this provider');
	}

	// Also update the stored status
	await db
		.update(issueLink)
		.set({ status: detail.state, statusSyncedAt: new Date() })
		.where(eq(issueLink.id, linkId));

	return json(detail);
});
