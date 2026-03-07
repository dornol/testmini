import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { projectApiKey } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { withProjectRole } from '$lib/server/api-handler';

export const DELETE = withProjectRole(['PROJECT_ADMIN'], async ({ params, projectId }) => {
	const keyId = Number(params.keyId);

	const existing = await db.query.projectApiKey.findFirst({
		where: and(eq(projectApiKey.id, keyId), eq(projectApiKey.projectId, projectId))
	});

	if (!existing) {
		error(404, 'API key not found');
	}

	await db.delete(projectApiKey).where(eq(projectApiKey.id, keyId));

	return json({ success: true });
});
