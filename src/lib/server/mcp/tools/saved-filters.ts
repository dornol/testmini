import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { project, savedFilter } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';

export function registerSavedFilterTools(server: McpServer, projectId: number) {
	server.tool(
		'list-saved-filters',
		'List all saved filters for the project',
		{},
		async () => {
			const filters = await db
				.select({
					id: savedFilter.id,
					name: savedFilter.name,
					filterType: savedFilter.filterType,
					filters: savedFilter.filters
				})
				.from(savedFilter)
				.where(eq(savedFilter.projectId, projectId));

			return { content: [{ type: 'text' as const, text: JSON.stringify(filters, null, 2) }] };
		}
	);

	server.tool(
		'create-saved-filter',
		'Create a saved filter',
		{
			name: z.string().describe('Filter name'),
			filterType: z.string().optional().describe('Filter type (default: test_cases)'),
			filters: z.record(z.string(), z.unknown()).describe('Filter criteria as JSON object')
		},
		async ({ name, filterType, filters }) => {
			const proj = await db.query.project.findFirst({ where: eq(project.id, projectId) });
			if (!proj) return { content: [{ type: 'text' as const, text: 'Project not found' }], isError: true };

			const [created] = await db
				.insert(savedFilter)
				.values({
					projectId,
					userId: proj.createdBy,
					name,
					filterType: filterType ?? 'test_cases',
					filters: filters as Record<string, unknown>
				})
				.returning();

			return { content: [{ type: 'text' as const, text: JSON.stringify(created, null, 2) }] };
		}
	);

	server.tool(
		'delete-saved-filter',
		'Delete a saved filter by ID',
		{ filterId: z.number().describe('Saved filter ID') },
		async ({ filterId }) => {
			const f = await db.query.savedFilter.findFirst({
				where: and(eq(savedFilter.id, filterId), eq(savedFilter.projectId, projectId))
			});
			if (!f) return { content: [{ type: 'text' as const, text: 'Saved filter not found' }], isError: true };

			await db.delete(savedFilter).where(eq(savedFilter.id, filterId));
			return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, deletedId: filterId }) }] };
		}
	);
}
