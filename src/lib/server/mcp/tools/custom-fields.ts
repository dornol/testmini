import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { customField } from '$lib/server/db/schema';
import { ok, err, requireProjectCreator } from '../helpers';
import { eq, and } from 'drizzle-orm';

export function registerCustomFieldTools(server: McpServer, projectId: number) {
	server.tool(
		'list-custom-fields',
		'List all custom fields for the project',
		{},
		async () => {
			const fields = await db
				.select({
					id: customField.id,
					name: customField.name,
					fieldType: customField.fieldType,
					options: customField.options,
					required: customField.required,
					sortOrder: customField.sortOrder
				})
				.from(customField)
				.where(eq(customField.projectId, projectId))
				.orderBy(customField.sortOrder);

			return ok(fields);
		}
	);

	server.tool(
		'create-custom-field',
		'Create a new custom field',
		{
			name: z.string().describe('Field name'),
			fieldType: z.enum(['TEXT', 'NUMBER', 'SELECT', 'MULTI_SELECT', 'DATE', 'URL', 'CHECKBOX']).describe('Field type'),
			options: z.array(z.string()).optional().describe('Options for SELECT/MULTI_SELECT types'),
			required: z.boolean().optional().describe('Is this field required (default: false)')
		},
		async ({ name, fieldType, options, required }) => {
			const creator = await requireProjectCreator(projectId);
			if (typeof creator !== 'string') return creator;

			const [created] = await db
				.insert(customField)
				.values({
					projectId,
					name,
					fieldType,
					options: options ?? null,
					required: required ?? false,
					createdBy: creator
				})
				.returning();

			return ok(created);
		}
	);

	server.tool(
		'delete-custom-field',
		'Delete a custom field by ID',
		{ fieldId: z.number().describe('Custom field ID') },
		async ({ fieldId }) => {
			const f = await db.query.customField.findFirst({
				where: and(eq(customField.id, fieldId), eq(customField.projectId, projectId))
			});
			if (!f) return err('Custom field not found');

			await db.delete(customField).where(eq(customField.id, fieldId));
			return ok({ success: true, deletedId: fieldId });
		}
	);
}
