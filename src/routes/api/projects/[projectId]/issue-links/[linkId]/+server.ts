import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { issueLink } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { withProjectRole } from '$lib/server/api-handler';
import { parseJsonBody, parseId } from '$lib/server/auth-utils';
import { validateIssueLinkUpdateInput } from '$lib/server/issue-link-update-validation';

export const PATCH = withProjectRole(
	['PROJECT_ADMIN', 'QA', 'DEV'],
	async ({ request, params, projectId }) => {
		const linkId = parseId(params.linkId, 'link ID');

		const existing = await db.query.issueLink.findFirst({
			where: and(eq(issueLink.id, linkId), eq(issueLink.projectId, projectId))
		});
		if (!existing) error(404, 'Issue link not found');

		const updates = validateIssueLinkUpdateInput(await parseJsonBody(request));
		if (updates instanceof Response) return updates;

		const [updated] = await db
			.update(issueLink)
			.set(updates)
			.where(and(eq(issueLink.id, linkId), eq(issueLink.projectId, projectId)))
			.returning();
		if (!updated) error(404, 'Issue link not found');

		return json({
			id: updated.id,
			testCaseId: updated.testCaseId,
			testExecutionId: updated.testExecutionId,
			externalUrl: updated.externalUrl,
			externalKey: updated.externalKey,
			title: updated.title,
			status: updated.status,
			provider: updated.provider,
			createdAt: updated.createdAt
		});
	}
);

export const DELETE = withProjectRole(
	['PROJECT_ADMIN', 'QA', 'DEV'],
	async ({ params, projectId }) => {
		const linkId = parseId(params.linkId, 'link ID');

		const existing = await db.query.issueLink.findFirst({
			where: and(eq(issueLink.id, linkId), eq(issueLink.projectId, projectId))
		});
		if (!existing) error(404, 'Issue link not found');

		const [deleted] = await db
			.delete(issueLink)
			.where(and(eq(issueLink.id, linkId), eq(issueLink.projectId, projectId)))
			.returning({ id: issueLink.id });
		if (!deleted) error(404, 'Issue link not found');

		return json({ success: true });
	}
);
