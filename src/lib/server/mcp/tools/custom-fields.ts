import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { project, customField } from '$lib/server/db/schema';
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

			return { content: [{ type: 'text' as const, text: JSON.stringify(fields, null, 2) }] };
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
			const proj = await db.query.project.findFirst({ where: eq(project.id, projectId) });
			if (!proj) return { content: [{ type: 'text' as const, text: 'Project not found' }], isError: true };

			const [created] = await db
				.insert(customField)
				.values({
					projectId,
					name,
					fieldType,
					options: options ?? null,
					required: required ?? false,
					createdBy: proj.createdBy
				})
				.returning();

			return { content: [{ type: 'text' as const, text: JSON.stringify(created, null, 2) }] };
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
			if (!f) return { content: [{ type: 'text' as const, text: 'Custom field not found' }], isError: true };

			await db.delete(customField).where(eq(customField.id, fieldId));
			return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, deletedId: fieldId }) }] };
		}
	);
}
