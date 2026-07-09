import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { notification } from '$lib/server/db/schema';
import { mcpLimitSchema, ok } from '../helpers';
import { eq, and, desc } from 'drizzle-orm';

const DEFAULT_NOTIFICATION_LIMIT = 20;
const MAX_NOTIFICATION_LIMIT = 100;

export function registerNotificationTools(server: McpServer, projectId: number) {
	server.tool(
		'list-notifications',
		'List recent notifications for the project',
		{
			unreadOnly: z.boolean().optional().describe('Only show unread notifications'),
			limit: mcpLimitSchema(MAX_NOTIFICATION_LIMIT)
				.optional()
				.describe('Max results (default 20, max 100)')
		},
		async ({ unreadOnly, limit }) => {
			const conditions = [eq(notification.projectId, projectId)];
			if (unreadOnly) conditions.push(eq(notification.isRead, false));

			const notes = await db
				.select({
					id: notification.id,
					type: notification.type,
					title: notification.title,
					message: notification.message,
					link: notification.link,
					isRead: notification.isRead,
					createdAt: notification.createdAt
				})
				.from(notification)
				.where(and(...conditions))
				.orderBy(desc(notification.createdAt))
				.limit(limit ?? DEFAULT_NOTIFICATION_LIMIT);

			return ok(notes);
		}
	);
}
