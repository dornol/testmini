import { json } from '@sveltejs/kit';
import { badRequest } from '$lib/server/errors';
import { db } from '$lib/server/db';
import { projectWebhook } from '$lib/server/db/schema';
import { eq, desc } from 'drizzle-orm';
import { withProjectRole } from '$lib/server/api-handler';
import { parseJsonObjectBody } from '$lib/server/auth-utils';
import { validateWebhookFields } from '$lib/server/webhook-validation';

export const GET = withProjectRole(
	['PROJECT_ADMIN', 'QA', 'DEV', 'VIEWER'],
	async ({ projectId }) => {
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

		return json(webhooks);
	}
);

export const POST = withProjectRole(['PROJECT_ADMIN'], async ({ request, user, projectId }) => {
	const body = await parseJsonObjectBody(request);
	const fields = await validateWebhookFields(body, { requireName: true, requireUrl: true });
	if (fields instanceof Response) return fields;

	const [created] = await db
		.insert(projectWebhook)
		.values({
			projectId,
			name: fields.name!,
			url: fields.url!,
			secret: fields.secret ?? null,
			events: fields.events ?? [],
			createdBy: user.id
		})
		.returning();

	return json(
		{
			id: created.id,
			name: created.name,
			url: created.url,
			events: created.events,
			enabled: created.enabled,
			createdAt: created.createdAt
		},
		{ status: 201 }
	);
});
