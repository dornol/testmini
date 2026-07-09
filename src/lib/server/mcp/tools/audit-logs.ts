import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { auditLog } from '$lib/server/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { mcpLimitSchema, ok } from '../helpers';

const DEFAULT_AUDIT_LOG_LIMIT = 50;
const MAX_AUDIT_LOG_LIMIT = 100;

export function registerAuditLogTools(server: McpServer, projectId: number) {
	server.tool(
		'list-audit-logs',
		'List recent audit logs for the project',
		{
			limit: mcpLimitSchema(MAX_AUDIT_LOG_LIMIT)
				.optional()
				.describe('Max results (default 50, max 100)'),
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
				.limit(limit ?? DEFAULT_AUDIT_LOG_LIMIT);

			return ok(logs);
		}
	);
}
