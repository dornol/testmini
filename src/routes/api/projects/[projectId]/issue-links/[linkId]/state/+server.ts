import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { issueLink, issueTrackerConfig, testCase } from '$lib/server/db/schema';
import { and, eq } from 'drizzle-orm';
import { withProjectRole } from '$lib/server/api-handler';
import { notFound, badRequest } from '$lib/server/errors';
import { updateIssueState } from '$lib/server/issue-tracker';
import { parseJsonBody } from '$lib/server/auth-utils';

export const POST = withProjectRole(
	['PROJECT_ADMIN', 'QA', 'DEV'],
	async ({ request, projectId, params }) => {
		const linkId = Number(params.linkId);
		if (!Number.isFinite(linkId)) error(400, 'Invalid link ID');

		let body: { state?: string };
		try {
			body = (await parseJsonBody(request)) as typeof body;
		} catch {
			error(400, 'Invalid request body');
		}

		const state = (body.state ?? '').trim();
		if (state !== 'open' && state !== 'closed') {
			return badRequest('State must be "open" or "closed"');
		}

		const link = await db.query.issueLink.findFirst({
			where: and(eq(issueLink.id, linkId), eq(issueLink.projectId, projectId))
		});
		if (!link) return notFound('Issue link not found');

		const config = await db.query.issueTrackerConfig.findFirst({
			where: eq(issueTrackerConfig.projectId, projectId)
		});
		if (!config) return notFound('Issue tracker not configured');

		await updateIssueState(
			{
				provider: config.provider,
				baseUrl: config.baseUrl,
				apiToken: config.apiToken,
				projectKey: config.projectKey,
				customTemplate: config.customTemplate as Record<string, unknown> | null
			},
			link.externalUrl,
			state
		);

		// Update local status
		await db
			.update(issueLink)
			.set({ status: state, statusSyncedAt: new Date() })
			.where(eq(issueLink.id, linkId));

		// Mark test case for retest when issue is closed
		if (state === 'closed' && link.testCaseId) {
			await db
				.update(testCase)
				.set({ retestNeeded: true })
				.where(eq(testCase.id, link.testCaseId));
		}

		return json({ success: true, state });
	}
);
