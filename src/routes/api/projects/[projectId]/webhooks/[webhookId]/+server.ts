import { json, error } from '@sveltejs/kit';
import { badRequest } from '$lib/server/errors';
import { db } from '$lib/server/db';
import { projectWebhook } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { withProjectRole } from '$lib/server/api-handler';
import { parseJsonObjectBody, parseId } from '$lib/server/auth-utils';
import { validateWebhookFields } from '$lib/server/webhook-validation';

export const PATCH = withProjectRole(['PROJECT_ADMIN'], async ({ request, params, projectId }) => {
	const webhookId = parseId(params.webhookId, 'webhook ID');

	const existing = await db.query.projectWebhook.findFirst({
		where: and(eq(projectWebhook.id, webhookId), eq(projectWebhook.projectId, projectId))
	});
	if (!existing) error(404, 'Webhook not found');

	const body = await parseJsonObjectBody(request);
	const fields = await validateWebhookFields(body, { allowEnabled: true });
	if (fields instanceof Response) return fields;

	const updates: Record<string, unknown> = {};

	if (fields.name !== undefined) updates.name = fields.name;
	if (fields.url !== undefined) updates.url = fields.url;
	if (fields.secret !== undefined) updates.secret = fields.secret;
	if (fields.events !== undefined) updates.events = fields.events;
	if (fields.enabled !== undefined) updates.enabled = fields.enabled;

	if (Object.keys(updates).length === 0) {
		return badRequest('No fields to update');
	}

	const [updated] = await db
		.update(projectWebhook)
		.set(updates)
		.where(and(eq(projectWebhook.id, webhookId), eq(projectWebhook.projectId, projectId)))
		.returning();
	if (!updated) error(404, 'Webhook not found');

	return json({
		id: updated.id,
		name: updated.name,
		url: updated.url,
		events: updated.events,
		enabled: updated.enabled,
		createdAt: updated.createdAt
	});
});

export const DELETE = withProjectRole(['PROJECT_ADMIN'], async ({ params, projectId }) => {
	const webhookId = parseId(params.webhookId, 'webhook ID');

	const existing = await db.query.projectWebhook.findFirst({
		where: and(eq(projectWebhook.id, webhookId), eq(projectWebhook.projectId, projectId))
	});
	if (!existing) error(404, 'Webhook not found');

	const [deleted] = await db
		.delete(projectWebhook)
		.where(and(eq(projectWebhook.id, webhookId), eq(projectWebhook.projectId, projectId)))
		.returning();

	if (!deleted) error(404, 'Webhook not found');

	return json({ success: true });
});
