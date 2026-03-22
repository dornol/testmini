import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { projectWebhook } from '$lib/server/db/schema';
import { ok, err, requireProjectCreator, buildUpdates } from '../helpers';
import { eq, and } from 'drizzle-orm';

export function registerWebhookTools(server: McpServer, projectId: number) {
	server.tool(
		'list-webhooks',
		'List all webhooks for the project',
		{},
		async () => {
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
		}
	);

	server.tool(
		'create-webhook',
		'Create a new webhook',
		{
			name: z.string().describe('Webhook name'),
			url: z.string().describe('Webhook URL'),
			events: z.array(z.string()).optional().describe('Events to subscribe to (e.g., run.completed, execution.status_changed)'),
			secret: z.string().optional().describe('Webhook secret for signature verification')
		},
		async ({ name, url, events, secret }) => {
			const creator = await requireProjectCreator(projectId);
			if (typeof creator !== 'string') return creator;

			const [created] = await db
				.insert(projectWebhook)
				.values({
					projectId,
					name,
					url,
					events: events ?? [],
					secret: secret ?? null,
					createdBy: creator
				})
				.returning();

			return ok(created);
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

			await db.delete(projectWebhook).where(eq(projectWebhook.id, webhookId));
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

			const updates: Record<string, unknown> = {};
			if (name !== undefined) updates.name = name;
			if (url !== undefined) updates.url = url;
			if (events !== undefined) updates.events = events;
			if (enabled !== undefined) updates.enabled = enabled;

			const [updated] = await db.update(projectWebhook).set(updates).where(eq(projectWebhook.id, webhookId)).returning();
			return ok(updated);
		}
	);
}
