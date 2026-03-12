import { json, error } from '@sveltejs/kit';
import { badRequest } from '$lib/server/errors';
import { db } from '$lib/server/db';
import { issueLink } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { withProjectRole } from '$lib/server/api-handler';
import { parseJsonBody } from '$lib/server/auth-utils';

export const PATCH = withProjectRole(
	['PROJECT_ADMIN', 'QA', 'DEV'],
	async ({ request, params, projectId }) => {
		const linkId = Number(params.linkId);

		const existing = await db.query.issueLink.findFirst({
			where: and(eq(issueLink.id, linkId), eq(issueLink.projectId, projectId))
		});
		if (!existing) error(404, 'Issue link not found');

		let body: { title?: string; status?: string };
		try {
			body = await parseJsonBody(request) as typeof body;
		} catch {
			error(400, 'Invalid request body');
		}

		const updates: Record<string, unknown> = {};

		if (body.title !== undefined) {
			updates.title = body.title.trim() || null;
		}
		if (body.status !== undefined) {
			updates.status = body.status.trim() || null;
		}

		if (Object.keys(updates).length === 0) {
			return badRequest('No fields to update');
		}

		await db.update(issueLink).set(updates).where(eq(issueLink.id, linkId));

		const updated = await db.query.issueLink.findFirst({
			where: eq(issueLink.id, linkId)
		});

		return json({
			id: updated!.id,
			testCaseId: updated!.testCaseId,
			testExecutionId: updated!.testExecutionId,
			externalUrl: updated!.externalUrl,
			externalKey: updated!.externalKey,
			title: updated!.title,
			status: updated!.status,
			provider: updated!.provider,
			createdAt: updated!.createdAt
		});
	}
);

export const DELETE = withProjectRole(
	['PROJECT_ADMIN', 'QA', 'DEV'],
	async ({ params, projectId }) => {
		const linkId = Number(params.linkId);

		const existing = await db.query.issueLink.findFirst({
			where: and(eq(issueLink.id, linkId), eq(issueLink.projectId, projectId))
		});
		if (!existing) error(404, 'Issue link not found');

		await db.delete(issueLink).where(eq(issueLink.id, linkId));

		return json({ success: true });
	}
);
