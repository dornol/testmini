import { json, error } from '@sveltejs/kit';
import { withProjectAccess } from '$lib/server/api-handler';
import { db } from '$lib/server/db';
import { sharedReport } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';

export const DELETE = withProjectAccess(async ({ params, projectId }) => {
	const shareId = Number(params.shareId);
	if (!Number.isFinite(shareId)) error(400, 'Invalid share ID');

	const [deleted] = await db
		.delete(sharedReport)
		.where(and(eq(sharedReport.id, shareId), eq(sharedReport.projectId, projectId)))
		.returning();

	if (!deleted) error(404, 'Shared report not found');

	return json({ success: true });
});
