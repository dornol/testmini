import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { auditLog } from '$lib/server/db/schema';
import { eq, and, desc } from 'drizzle-orm';

export function registerAuditLogTools(server: McpServer, projectId: number) {
	server.tool(
		'list-audit-logs',
		'List recent audit logs for the project',
		{
			limit: z.number().optional().describe('Max results (default 50)'),
			action: z.string().optional().describe('Filter by action type')
		},
		async ({ limit, action }) => {
			const conditions = [eq(auditLog.projectId, projectId)];
			if (action) conditions.push(eq(auditLog.action, action));

			const logs = await db
				.select({
					id: auditLog.id,
					userId: auditLog.userId,
					action: auditLog.action,
					entityType: auditLog.entityType,
					entityId: auditLog.entityId,
					metadata: auditLog.metadata,
					createdAt: auditLog.createdAt
				})
				.from(auditLog)
				.where(and(...conditions))
				.orderBy(desc(auditLog.createdAt))
				.limit(limit ?? 50);

			return { content: [{ type: 'text' as const, text: JSON.stringify(logs, null, 2) }] };
		}
	);
}
