import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { projectApiKey } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireAuth, requireProjectRole } from '$lib/server/auth-utils';

export const DELETE: RequestHandler = async ({ params, locals }) => {
	const authUser = requireAuth(locals);
	const projectId = Number(params.projectId);
	const keyId = Number(params.keyId);
	await requireProjectRole(authUser, projectId, ['PROJECT_ADMIN']);

	const existing = await db.query.projectApiKey.findFirst({
		where: and(eq(projectApiKey.id, keyId), eq(projectApiKey.projectId, projectId))
	});

	if (!existing) {
		error(404, 'API key not found');
	}

	await db.delete(projectApiKey).where(eq(projectApiKey.id, keyId));

	return json({ success: true });
};
