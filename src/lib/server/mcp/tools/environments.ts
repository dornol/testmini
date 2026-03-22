import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { environmentConfig } from '$lib/server/db/schema';
import { ok, err, requireProjectCreator } from '../helpers';
import { eq, and } from 'drizzle-orm';

export function registerEnvironmentTools(server: McpServer, projectId: number) {
	server.tool(
		'list-environments',
		'List all environments for the project',
		{},
		async () => {
			const envs = await db
				.select({
					id: environmentConfig.id,
					name: environmentConfig.name,
					color: environmentConfig.color,
					position: environmentConfig.position,
					isDefault: environmentConfig.isDefault,
					baseUrl: environmentConfig.baseUrl,
					memo: environmentConfig.memo
				})
				.from(environmentConfig)
				.where(eq(environmentConfig.projectId, projectId))
				.orderBy(environmentConfig.position);

			return ok(envs);
		}
	);

	server.tool(
		'create-environment',
		'Create a new environment',
		{
			name: z.string().describe('Environment name (e.g., DEV, QA, STAGING, PROD)'),
			color: z.string().optional().describe('Color hex (default: #6b7280)'),
			isDefault: z.boolean().optional().describe('Set as default environment'),
			baseUrl: z.string().optional().describe('Base URL for this environment'),
			memo: z.string().optional().describe('Notes about this environment')
		},
		async ({ name, color, isDefault, baseUrl, memo }) => {
			const creator = await requireProjectCreator(projectId);
			if (typeof creator !== 'string') return creator;

			const [created] = await db
				.insert(environmentConfig)
				.values({
					projectId,
					name,
					color: color ?? '#6b7280',
					isDefault: isDefault ?? false,
					baseUrl: baseUrl ?? null,
					memo: memo ?? null,
					createdBy: creator
				})
				.returning();

			return ok(created);
		}
	);

	server.tool(
		'delete-environment',
		'Delete an environment by ID',
		{ environmentId: z.number().describe('Environment ID') },
		async ({ environmentId }) => {
			const env = await db.query.environmentConfig.findFirst({
				where: and(eq(environmentConfig.id, environmentId), eq(environmentConfig.projectId, projectId))
			});
			if (!env) return err('Environment not found');

			await db.delete(environmentConfig).where(eq(environmentConfig.id, environmentId));
			return ok({ success: true, deletedId: environmentId });
		}
	);

	server.tool(
		'update-environment',
		'Update an environment',
		{
			environmentId: z.number().describe('Environment ID'),
			name: z.string().optional().describe('New name'),
			color: z.string().optional().describe('New color hex'),
			isDefault: z.boolean().optional().describe('Set as default'),
			baseUrl: z.string().optional().describe('Base URL'),
			memo: z.string().optional().describe('Notes')
		},
		async ({ environmentId, name, color, isDefault, baseUrl, memo }) => {
			const env = await db.query.environmentConfig.findFirst({
				where: and(eq(environmentConfig.id, environmentId), eq(environmentConfig.projectId, projectId))
			});
			if (!env) return err('Environment not found');

			const updates: Record<string, unknown> = {};
			if (name !== undefined) updates.name = name;
			if (color !== undefined) updates.color = color;
			if (isDefault !== undefined) updates.isDefault = isDefault;
			if (baseUrl !== undefined) updates.baseUrl = baseUrl;
			if (memo !== undefined) updates.memo = memo;

			const [updated] = await db.update(environmentConfig).set(updates).where(eq(environmentConfig.id, environmentId)).returning();
			return ok(updated);
		}
	);
}
