import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { sharedDataSet } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { ok, err, requireProjectCreator } from '../helpers';

export function registerSharedDataSetTools(server: McpServer, projectId: number) {
	server.tool(
		'list-shared-datasets',
		'List all shared datasets in the project',
		{},
		async () => {
			const datasets = await db
				.select({
					id: sharedDataSet.id,
					name: sharedDataSet.name,
					parameters: sharedDataSet.parameters,
					createdAt: sharedDataSet.createdAt
				})
				.from(sharedDataSet)
				.where(eq(sharedDataSet.projectId, projectId));

			return ok(datasets);
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
			const creator = await requireProjectCreator(projectId);
			if (typeof creator !== 'string') return creator;

			const [created] = await db
				.insert(sharedDataSet)
				.values({
					projectId,
					name,
					parameters,
					rows: rows ?? [],
					createdBy: creator
				})
				.returning();

			return ok(created);
		}
	);

	server.tool(
		'delete-shared-dataset',
		'Delete a shared dataset by ID',
		{ datasetId: z.number().describe('Shared dataset ID') },
		async ({ datasetId }) => {
			const ds = await db.query.sharedDataSet.findFirst({
				where: and(eq(sharedDataSet.id, datasetId), eq(sharedDataSet.projectId, projectId))
			});
			if (!ds) return err('Shared dataset not found');

			await db.delete(sharedDataSet).where(eq(sharedDataSet.id, datasetId));
			return ok({ success: true, deletedId: datasetId });
		}
	);

	server.tool(
		'update-shared-dataset',
		'Update a shared dataset',
		{
			datasetId: z.number().describe('Dataset ID'),
			name: z.string().optional().describe('New name'),
			parameters: z.array(z.string()).optional().describe('New parameter names'),
			rows: z.array(z.record(z.string(), z.string())).optional().describe('New data rows')
		},
		async ({ datasetId, name, parameters, rows }) => {
			const ds = await db.query.sharedDataSet.findFirst({
				where: and(eq(sharedDataSet.id, datasetId), eq(sharedDataSet.projectId, projectId))
			});
			if (!ds) return err('Shared dataset not found');

			const updates: Record<string, unknown> = {};
			if (name !== undefined) updates.name = name;
			if (parameters !== undefined) updates.parameters = parameters;
			if (rows !== undefined) updates.rows = rows;

			const [updated] = await db.update(sharedDataSet).set(updates).where(eq(sharedDataSet.id, datasetId)).returning();
			return ok(updated);
		}
	);
}
