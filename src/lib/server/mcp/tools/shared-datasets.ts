import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { project, sharedDataSet } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';

export function registerSharedDataSetTools(server: McpServer, projectId: number) {
	server.tool(
		'list-shared-datasets',
		'List all shared datasets in the project',
		{},
		async () => {
			try {
				const datasets = await db
					.select({
						id: sharedDataSet.id,
						name: sharedDataSet.name,
						parameters: sharedDataSet.parameters,
						createdAt: sharedDataSet.createdAt
					})
					.from(sharedDataSet)
					.where(eq(sharedDataSet.projectId, projectId));

				return {
					content: [{ type: 'text' as const, text: JSON.stringify(datasets, null, 2) }]
				};
			} catch (e) {
				return {
					content: [{ type: 'text' as const, text: `Error: ${(e as Error).message}` }],
					isError: true
				};
			}
		}
	);

	server.tool(
		'create-shared-dataset',
		'Create a new shared dataset',
		{
			name: z.string().describe('Dataset name'),
			parameters: z.array(z.string()).describe('Parameter names (column headers)'),
			rows: z
				.array(z.record(z.string(), z.string()))
				.optional()
				.describe('Data rows as array of objects mapping parameter names to values')
		},
		async ({ name, parameters, rows }) => {
			try {
				const proj = await db.query.project.findFirst({ where: eq(project.id, projectId) });
				if (!proj)
					return {
						content: [{ type: 'text' as const, text: 'Project not found' }],
						isError: true
					};

				const [created] = await db
					.insert(sharedDataSet)
					.values({
						projectId,
						name,
						parameters,
						rows: rows ?? [],
						createdBy: proj.createdBy
					})
					.returning();

				return {
					content: [{ type: 'text' as const, text: JSON.stringify(created, null, 2) }]
				};
			} catch (e) {
				return {
					content: [{ type: 'text' as const, text: `Error: ${(e as Error).message}` }],
					isError: true
				};
			}
		}
	);

	server.tool(
		'delete-shared-dataset',
		'Delete a shared dataset by ID',
		{ datasetId: z.number().describe('Shared dataset ID') },
		async ({ datasetId }) => {
			try {
				const ds = await db.query.sharedDataSet.findFirst({
					where: and(eq(sharedDataSet.id, datasetId), eq(sharedDataSet.projectId, projectId))
				});
				if (!ds)
					return {
						content: [{ type: 'text' as const, text: 'Shared dataset not found' }],
						isError: true
					};

				await db.delete(sharedDataSet).where(eq(sharedDataSet.id, datasetId));

				return {
					content: [
						{
							type: 'text' as const,
							text: JSON.stringify({ success: true, deletedId: datasetId })
						}
					]
				};
			} catch (e) {
				return {
					content: [{ type: 'text' as const, text: `Error: ${(e as Error).message}` }],
					isError: true
				};
			}
		}
	);
}
