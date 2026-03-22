import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { project, projectWebhook } from '$lib/server/db/schema';
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

			return { content: [{ type: 'text' as const, text: JSON.stringify(webhooks, null, 2) }] };
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
			const proj = await db.query.project.findFirst({ where: eq(project.id, projectId) });
			if (!proj) return { content: [{ type: 'text' as const, text: 'Project not found' }], isError: true };

			const [created] = await db
				.insert(projectWebhook)
				.values({
					projectId,
					name,
					url,
					events: events ?? [],
					secret: secret ?? null,
					createdBy: proj.createdBy
				})
				.returning();

			return { content: [{ type: 'text' as const, text: JSON.stringify(created, null, 2) }] };
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
			if (!wh) return { content: [{ type: 'text' as const, text: 'Webhook not found' }], isError: true };

			await db.delete(projectWebhook).where(eq(projectWebhook.id, webhookId));
			return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, deletedId: webhookId }) }] };
		}
	);
}
