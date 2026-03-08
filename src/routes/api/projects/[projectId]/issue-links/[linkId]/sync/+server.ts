import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { issueLink, issueTrackerConfig } from '$lib/server/db/schema';
import { and, eq } from 'drizzle-orm';
import { withProjectRole } from '$lib/server/api-handler';
import { notFound, badRequest } from '$lib/server/errors';
import { fetchIssueStatus } from '$lib/server/issue-tracker';

export const POST = withProjectRole(
	['PROJECT_ADMIN', 'QA', 'DEV'],
	async ({ user, projectId, params }) => {
		const linkId = Number(params.linkId);
		if (!Number.isFinite(linkId)) error(400, 'Invalid link ID');

		const link = await db.query.issueLink.findFirst({
			where: and(eq(issueLink.id, linkId), eq(issueLink.projectId, projectId))
		});
		if (!link) return notFound('Issue link not found');

		if (link.provider === 'CUSTOM') {
			return badRequest('Status sync is not available for custom providers');
		}

		const config = await db.query.issueTrackerConfig.findFirst({
			where: eq(issueTrackerConfig.projectId, projectId)
		});
		if (!config) return notFound('Issue tracker not configured');

		const result = await fetchIssueStatus(
			{
				provider: config.provider,
				baseUrl: config.baseUrl,
				apiToken: config.apiToken,
				projectKey: config.projectKey,
				customTemplate: config.customTemplate as Record<string, unknown> | null
			},
			link.externalUrl,
			link.externalKey
		);

		const [updated] = await db
			.update(issueLink)
			.set({ status: result.status, statusSyncedAt: new Date() })
			.where(eq(issueLink.id, linkId))
			.returning();

		return json({ ...updated, statusCategory: result.statusCategory });
	}
);
