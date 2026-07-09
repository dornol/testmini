import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { sharedDataSet } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { ok, err, requireProjectCreator, mcpPositiveIdSchema } from '../helpers';
import {
	validateDataSetName,
	validateDataSetParameters,
	validateDataSetRows,
	validateRequestBody
} from '$lib/server/shared-dataset-validation';

async function mcpValidationError(
	response: Response,
	fallback: string
): Promise<ReturnType<typeof err>> {
	const body = (await response.json().catch(() => null)) as { error?: string } | null;
	return err(body?.error ?? fallback);
}

export function registerSharedDataSetTools(server: McpServer, projectId: number) {
	server.tool('list-shared-datasets', 'List all shared datasets in the project', {}, async () => {
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
	});

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

			const bodyOrError = validateRequestBody({ name, parameters, rows });
			if (bodyOrError instanceof Response) {
				return mcpValidationError(bodyOrError, 'Invalid shared dataset');
			}

			const nameOrError = validateDataSetName(bodyOrError.name);
			if (nameOrError instanceof Response) {
				return mcpValidationError(nameOrError, 'Invalid shared dataset');
			}

			const parametersOrError = validateDataSetParameters(bodyOrError.parameters);
			if (parametersOrError instanceof Response) {
				return mcpValidationError(parametersOrError, 'Invalid shared dataset');
			}

			const rowsOrError = validateDataSetRows(bodyOrError.rows, parametersOrError);
			if (rowsOrError instanceof Response) {
				return mcpValidationError(rowsOrError, 'Invalid shared dataset');
			}

			const [created] = await db
				.insert(sharedDataSet)
				.values({
					projectId,
					name: nameOrError,
					parameters: parametersOrError,
					rows: rowsOrError,
					createdBy: creator
				})
				.returning();

			if (!created) return err('Failed to create shared dataset');
			return ok(created);
		}
	);

	server.tool(
		'delete-shared-dataset',
		'Delete a shared dataset by ID',
		{ datasetId: mcpPositiveIdSchema.describe('Shared dataset ID') },
		async ({ datasetId }) => {
			const ds = await db.query.sharedDataSet.findFirst({
				where: and(eq(sharedDataSet.id, datasetId), eq(sharedDataSet.projectId, projectId))
			});
			if (!ds) return err('Shared dataset not found');

			const [deleted] = await db
				.delete(sharedDataSet)
				.where(and(eq(sharedDataSet.id, datasetId), eq(sharedDataSet.projectId, projectId)))
				.returning({ id: sharedDataSet.id });
			if (!deleted) return err('Shared dataset not found');
			return ok({ success: true, deletedId: datasetId });
		}
	);

	server.tool(
		'update-shared-dataset',
		'Update a shared dataset',
		{
			datasetId: mcpPositiveIdSchema.describe('Dataset ID'),
			name: z.string().optional().describe('New name'),
			parameters: z.array(z.string()).optional().describe('New parameter names'),
			rows: z.array(z.record(z.string(), z.string())).optional().describe('New data rows')
		},
		async ({ datasetId, name, parameters, rows }) => {
			const input: Record<string, unknown> = {};
			if (name !== undefined) input.name = name;
			if (parameters !== undefined) input.parameters = parameters;
			if (rows !== undefined) input.rows = rows;

			const bodyOrError = validateRequestBody(input);
			if (bodyOrError instanceof Response) {
				return mcpValidationError(bodyOrError, 'Invalid shared dataset');
			}
			if (Object.keys(bodyOrError).length === 0) return err('No fields to update');

			const updates: Record<string, unknown> = {};
			if (bodyOrError.name !== undefined) {
				const nameOrError = validateDataSetName(bodyOrError.name);
				if (nameOrError instanceof Response) {
					return mcpValidationError(nameOrError, 'Invalid shared dataset');
				}
				updates.name = nameOrError;
			}

			let nextParameters: string[] | undefined;
			if (bodyOrError.parameters !== undefined) {
				const parametersOrError = validateDataSetParameters(bodyOrError.parameters);
				if (parametersOrError instanceof Response) {
					return mcpValidationError(parametersOrError, 'Invalid shared dataset');
				}
				nextParameters = parametersOrError;
				updates.parameters = parametersOrError;
			}

			if (bodyOrError.rows !== undefined && nextParameters !== undefined) {
				const rowsOrError = validateDataSetRows(bodyOrError.rows, nextParameters);
				if (rowsOrError instanceof Response) {
					return mcpValidationError(rowsOrError, 'Invalid shared dataset');
				}
				updates.rows = rowsOrError;
			}

			const ds = await db.query.sharedDataSet.findFirst({
				where: and(eq(sharedDataSet.id, datasetId), eq(sharedDataSet.projectId, projectId))
			});
			if (!ds) return err('Shared dataset not found');

			if (bodyOrError.rows !== undefined && updates.rows === undefined) {
				const rowsOrError = validateDataSetRows(
					bodyOrError.rows,
					(ds.parameters as string[]) ?? []
				);
				if (rowsOrError instanceof Response) {
					return mcpValidationError(rowsOrError, 'Invalid shared dataset');
				}
				updates.rows = rowsOrError;
			}

			const [updated] = await db
				.update(sharedDataSet)
				.set(updates)
				.where(and(eq(sharedDataSet.id, datasetId), eq(sharedDataSet.projectId, projectId)))
				.returning();
			if (!updated) return err('Shared dataset not found');
			return ok(updated);
		}
	);
}
