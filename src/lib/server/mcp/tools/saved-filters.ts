import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { savedFilter } from '$lib/server/db/schema';
import { ok, err, requireProjectCreator } from '../helpers';
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

			return ok(filters);
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
			const creator = await requireProjectCreator(projectId);
			if (typeof creator !== 'string') return creator;

			const [created] = await db
				.insert(savedFilter)
				.values({
					projectId,
					userId: creator,
					name,
					filterType: filterType ?? 'test_cases',
					filters: filters as Record<string, unknown>
				})
				.returning();

			return ok(created);
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
			if (!f) return err('Saved filter not found');

			await db.delete(savedFilter).where(eq(savedFilter.id, filterId));
			return ok({ success: true, deletedId: filterId });
		}
	);
}
