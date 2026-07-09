import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { environmentConfig } from '$lib/server/db/schema';
import { ok, err, requireProjectCreator } from '../helpers';
import { eq, and } from 'drizzle-orm';
import { createEnvironmentSchema } from '$lib/schemas/environment.schema';
import { getNextPosition } from '$lib/server/queries';

const updateEnvironmentToolSchema = createEnvironmentSchema
	.pick({
		name: true,
		color: true,
		isDefault: true,
		baseUrl: true,
		memo: true
	})
	.partial()
	.refine((value) => Object.keys(value).length > 0, 'At least one field is required');

function firstValidationError(error: { issues: Array<{ message: string }> }): string {
	return error.issues[0]?.message ?? 'Invalid environment';
}

export function registerEnvironmentTools(server: McpServer, projectId: number) {
	server.tool('list-environments', 'List all environments for the project', {}, async () => {
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
	});

	server.tool(
		'create-environment',
		'Create a new environment',
		{
			name: z.string().min(1).max(30).describe('Environment name (e.g., DEV, QA, STAGING, PROD)'),
			color: z
				.string()
				.regex(/^#[0-9a-fA-F]{6}$/)
				.optional()
				.describe('Color hex (default: #6b7280)'),
			isDefault: z.boolean().optional().describe('Set as default environment'),
			baseUrl: z.string().max(500).optional().describe('Base URL for this environment'),
			memo: z.string().max(2000).optional().describe('Notes about this environment')
		},
		async ({ name, color, isDefault, baseUrl, memo }) => {
			const creator = await requireProjectCreator(projectId);
			if (typeof creator !== 'string') return creator;

			const parsed = createEnvironmentSchema.safeParse({
				name: name.trim(),
				color: color?.trim() ?? '#6b7280',
				isDefault: isDefault ?? false,
				baseUrl: baseUrl?.trim() ?? '',
				credentials: '',
				memo: memo?.trim() ?? ''
			});
			if (!parsed.success) return err(firstValidationError(parsed.error));

			const nextPosition = await getNextPosition(environmentConfig, projectId);
			if (parsed.data.isDefault) {
				await db
					.update(environmentConfig)
					.set({ isDefault: false })
					.where(eq(environmentConfig.projectId, projectId));
			}

			const [created] = await db
				.insert(environmentConfig)
				.values({
					projectId,
					name: parsed.data.name,
					color: parsed.data.color,
					position: nextPosition,
					isDefault: parsed.data.isDefault,
					baseUrl: parsed.data.baseUrl || null,
					memo: parsed.data.memo || null,
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
				where: and(
					eq(environmentConfig.id, environmentId),
					eq(environmentConfig.projectId, projectId)
				)
			});
			if (!env) return err('Environment not found');

			await db
				.delete(environmentConfig)
				.where(
					and(eq(environmentConfig.id, environmentId), eq(environmentConfig.projectId, projectId))
				);
			return ok({ success: true, deletedId: environmentId });
		}
	);

	server.tool(
		'update-environment',
		'Update an environment',
		{
			environmentId: z.number().describe('Environment ID'),
			name: z.string().min(1).max(30).optional().describe('New name'),
			color: z
				.string()
				.regex(/^#[0-9a-fA-F]{6}$/)
				.optional()
				.describe('New color hex'),
			isDefault: z.boolean().optional().describe('Set as default'),
			baseUrl: z.string().max(500).optional().describe('Base URL'),
			memo: z.string().max(2000).optional().describe('Notes')
		},
		async ({ environmentId, name, color, isDefault, baseUrl, memo }) => {
			const env = await db.query.environmentConfig.findFirst({
				where: and(
					eq(environmentConfig.id, environmentId),
					eq(environmentConfig.projectId, projectId)
				)
			});
			if (!env) return err('Environment not found');

			const parsed = updateEnvironmentToolSchema.safeParse({
				name: name?.trim(),
				color: color?.trim(),
				isDefault,
				baseUrl: baseUrl?.trim(),
				memo: memo?.trim()
			});
			if (!parsed.success) return err(firstValidationError(parsed.error));

			const updates: Record<string, unknown> = {};
			if (parsed.data.name !== undefined) updates.name = parsed.data.name;
			if (parsed.data.color !== undefined) updates.color = parsed.data.color;
			if (parsed.data.isDefault !== undefined) updates.isDefault = parsed.data.isDefault;
			if (parsed.data.baseUrl !== undefined) updates.baseUrl = parsed.data.baseUrl || null;
			if (parsed.data.memo !== undefined) updates.memo = parsed.data.memo || null;

			if (parsed.data.isDefault) {
				await db
					.update(environmentConfig)
					.set({ isDefault: false })
					.where(eq(environmentConfig.projectId, projectId));
			}

			const [updated] = await db
				.update(environmentConfig)
				.set(updates)
				.where(
					and(eq(environmentConfig.id, environmentId), eq(environmentConfig.projectId, projectId))
				)
				.returning();
			return ok(updated);
		}
	);
}
