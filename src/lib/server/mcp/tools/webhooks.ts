import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { projectWebhook } from '$lib/server/db/schema';
import { ok, err, requireProjectCreator } from '../helpers';
import { eq, and } from 'drizzle-orm';
import { validatePublicHttpUrl } from '$lib/server/url-safety';

const VALID_EVENTS = [
	'TEST_RUN_COMPLETED',
	'TEST_FAILED',
	'COMMENT_ADDED',
	'MEMBER_ADDED',
	'ASSIGNED'
];
const MAX_WEBHOOK_NAME_LENGTH = 100;

function publicWebhook(w: typeof projectWebhook.$inferSelect) {
	return {
		id: w.id,
		name: w.name,
		url: w.url,
		events: w.events,
		enabled: w.enabled,
		createdAt: w.createdAt
	};
}

async function validateWebhookInput(input: {
	name?: string;
	url?: string;
	events?: string[];
}): Promise<
	{ ok: true; name?: string; url?: string; events?: string[] } | { ok: false; error: string }
> {
	const result: { name?: string; url?: string; events?: string[] } = {};

	if (input.name !== undefined) {
		const name = input.name.trim();
		if (!name || name.length > MAX_WEBHOOK_NAME_LENGTH) {
			return { ok: false, error: 'Name is required (max 100 chars)' };
		}
		result.name = name;
	}

	if (input.url !== undefined) {
		const url = input.url.trim();
		if (!url) return { ok: false, error: 'URL is required' };
		const validation = await validatePublicHttpUrl(url);
		if (!validation.ok) return { ok: false, error: validation.error ?? 'Invalid URL' };
		result.url = url;
	}

	if (input.events !== undefined) {
		for (const event of input.events) {
			if (!VALID_EVENTS.includes(event)) {
				return { ok: false, error: `Invalid event type: ${event}` };
			}
		}
		result.events = input.events;
	}

	return { ok: true, ...result };
}

export function registerWebhookTools(server: McpServer, projectId: number) {
	server.tool('list-webhooks', 'List all webhooks for the project', {}, async () => {
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
			.where(eq(projectWebhook.projectId, projectId));

		return ok(webhooks);
	});

	server.tool(
		'create-webhook',
		'Create a new webhook',
		{
			name: z.string().max(MAX_WEBHOOK_NAME_LENGTH).describe('Webhook name'),
			url: z.string().describe('Webhook URL'),
			events: z
				.array(z.string())
				.optional()
				.describe('Events to subscribe to (e.g., TEST_RUN_COMPLETED, TEST_FAILED)'),
			secret: z.string().optional().describe('Webhook secret for signature verification')
		},
		async ({ name, url, events, secret }) => {
			const creator = await requireProjectCreator(projectId);
			if (typeof creator !== 'string') return creator;

			const validation = await validateWebhookInput({ name, url, events });
			if (!validation.ok) return err(validation.error);

			const [created] = await db
				.insert(projectWebhook)
				.values({
					projectId,
					name: validation.name!,
					url: validation.url!,
					events: validation.events ?? [],
					secret: secret?.trim() || null,
					createdBy: creator
				})
				.returning();

			return ok(publicWebhook(created));
		}
	);

	server.tool(
		'delete-webhook',
		'Delete a webhook by ID',
		{ webhookId: z.number().describe('Webhook ID') },
		async ({ webhookId }) => {
			const wh = await db.query.projectWebhook.findFirst({
				where: and(eq(projectWebhook.id, webhookId), eq(projectWebhook.projectId, projectId))
			});
			if (!wh) return err('Webhook not found');

			await db
				.delete(projectWebhook)
				.where(and(eq(projectWebhook.id, webhookId), eq(projectWebhook.projectId, projectId)));
			return ok({ success: true, deletedId: webhookId });
		}
	);

	server.tool(
		'update-webhook',
		'Update a webhook',
		{
			webhookId: z.number().describe('Webhook ID'),
			name: z.string().optional().describe('New name'),
			url: z.string().optional().describe('New URL'),
			events: z.array(z.string()).optional().describe('New events'),
			enabled: z.boolean().optional().describe('Enable/disable')
		},
		async ({ webhookId, name, url, events, enabled }) => {
			const wh = await db.query.projectWebhook.findFirst({
				where: and(eq(projectWebhook.id, webhookId), eq(projectWebhook.projectId, projectId))
			});
			if (!wh) return err('Webhook not found');

			const validation = await validateWebhookInput({ name, url, events });
			if (!validation.ok) return err(validation.error);

			const updates: Record<string, unknown> = {};
			if (validation.name !== undefined) updates.name = validation.name;
			if (validation.url !== undefined) updates.url = validation.url;
			if (validation.events !== undefined) updates.events = validation.events;
			if (enabled !== undefined) updates.enabled = enabled;

			if (Object.keys(updates).length === 0) return err('No fields to update');

			const [updated] = await db
				.update(projectWebhook)
				.set(updates)
				.where(and(eq(projectWebhook.id, webhookId), eq(projectWebhook.projectId, projectId)))
				.returning();
			return ok(publicWebhook(updated));
		}
	);
}
