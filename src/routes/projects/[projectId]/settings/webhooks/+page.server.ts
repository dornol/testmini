import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { projectWebhook } from '$lib/server/db/schema';
import { eq, desc } from 'drizzle-orm';
import { requireAuth, requireProjectRole } from '$lib/server/auth-utils';

export const load: PageServerLoad = async ({ params, locals }) => {
	const authUser = requireAuth(locals);
	const projectId = Number(params.projectId);
	await requireProjectRole(authUser, projectId, ['PROJECT_ADMIN']);

	const webhooks = await db
		.select({
			id: projectWebhook.id,
			name: projectWebhook.name,
			url: projectWebhook.url,
			events: projectWebhook.events,
			enabled: projectWebhook.enabled,
			createdAt: projectWebhook.createdAt
		})
		.from(projectWebhook)
		.where(eq(projectWebhook.projectId, projectId))
		.orderBy(desc(projectWebhook.createdAt));

	return { webhooks };
};
