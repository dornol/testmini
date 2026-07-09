import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { projectApiKey } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { withProjectRole } from '$lib/server/api-handler';
import { parseId } from '$lib/server/auth-utils';

export const DELETE = withProjectRole(['PROJECT_ADMIN'], async ({ params, projectId }) => {
	const keyId = parseId(params.keyId, 'key ID');

	const existing = await db.query.projectApiKey.findFirst({
		where: and(eq(projectApiKey.id, keyId), eq(projectApiKey.projectId, projectId))
	});

	if (!existing) {
		error(404, 'API key not found');
	}

	const [deleted] = await db
		.delete(projectApiKey)
		.where(and(eq(projectApiKey.id, keyId), eq(projectApiKey.projectId, projectId)))
		.returning();

	if (!deleted) {
		error(404, 'API key not found');
	}

	return json({ success: true });
});
