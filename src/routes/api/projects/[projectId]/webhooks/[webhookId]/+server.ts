import { json, error } from '@sveltejs/kit';
import { badRequest } from '$lib/server/errors';
import { db } from '$lib/server/db';
import { projectWebhook } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { withProjectRole } from '$lib/server/api-handler';

const VALID_EVENTS = [
	'TEST_RUN_COMPLETED',
	'TEST_FAILED',
	'COMMENT_ADDED',
	'MEMBER_ADDED',
	'ASSIGNED'
];

export const PATCH = withProjectRole(['PROJECT_ADMIN'], async ({ request, params, projectId }) => {
	const webhookId = Number(params.webhookId);

	const existing = await db.query.projectWebhook.findFirst({
		where: and(eq(projectWebhook.id, webhookId), eq(projectWebhook.projectId, projectId))
	});
	if (!existing) error(404, 'Webhook not found');

	let body: { name?: string; url?: string; secret?: string; events?: string[]; enabled?: boolean };
	try {
		body = await request.json();
	} catch {
		error(400, 'Invalid request body');
	}

	const updates: Record<string, unknown> = {};

	if (body.name !== undefined) {
		const name = body.name.trim();
		if (!name || name.length > 100) return badRequest('Name is required (max 100 chars)');
		updates.name = name;
	}

	if (body.url !== undefined) {
		const url = body.url.trim();
		if (!url) return badRequest('URL is required');
		try {
			const parsed = new URL(url);
			if (!['http:', 'https:'].includes(parsed.protocol)) {
				return badRequest('URL must use http or https');
			}
		} catch {
			return badRequest('Invalid URL');
		}
		updates.url = url;
	}

	if (body.secret !== undefined) {
		updates.secret = body.secret.trim() || null;
	}

	if (body.events !== undefined) {
		for (const e of body.events) {
			if (!VALID_EVENTS.includes(e)) return badRequest(`Invalid event type: ${e}`);
		}
		updates.events = body.events;
	}

	if (body.enabled !== undefined) {
		updates.enabled = body.enabled;
	}

	if (Object.keys(updates).length === 0) {
		return badRequest('No fields to update');
	}

	await db.update(projectWebhook).set(updates).where(eq(projectWebhook.id, webhookId));

	const updated = await db.query.projectWebhook.findFirst({
		where: eq(projectWebhook.id, webhookId)
	});

	return json({
		id: updated!.id,
		name: updated!.name,
		url: updated!.url,
		events: updated!.events,
		enabled: updated!.enabled,
		createdAt: updated!.createdAt
	});
});

export const DELETE = withProjectRole(['PROJECT_ADMIN'], async ({ params, projectId }) => {
	const webhookId = Number(params.webhookId);

	const existing = await db.query.projectWebhook.findFirst({
		where: and(eq(projectWebhook.id, webhookId), eq(projectWebhook.projectId, projectId))
	});
	if (!existing) error(404, 'Webhook not found');

	await db.delete(projectWebhook).where(eq(projectWebhook.id, webhookId));

	return json({ success: true });
});
