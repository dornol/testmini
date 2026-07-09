import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { customField } from '$lib/server/db/schema';
import { ok, err, requireProjectCreator, mcpPositiveIdSchema } from '../helpers';
import { eq, and } from 'drizzle-orm';

const FIELD_TYPES = [
	'TEXT',
	'NUMBER',
	'SELECT',
	'MULTI_SELECT',
	'DATE',
	'URL',
	'CHECKBOX'
] as const;
const SELECT_FIELD_TYPES = new Set<string>(['SELECT', 'MULTI_SELECT']);
const MAX_NAME_LENGTH = 80;
const MAX_OPTIONS = 50;
const MAX_OPTION_LENGTH = 100;

function validateFieldName(name: string): string | ReturnType<typeof err> {
	const trimmed = name.trim();
	if (!trimmed) return err('Field name is required');
	if (trimmed.length > MAX_NAME_LENGTH) {
		return err(`Field name must be ${MAX_NAME_LENGTH} characters or less`);
	}
	return trimmed;
}

function validateOptions(
	fieldType: string,
	options: string[] | undefined
): string[] | null | ReturnType<typeof err> {
	if (!SELECT_FIELD_TYPES.has(fieldType)) {
		if (options !== undefined && options.length > 0) {
			return err('Options are only allowed for SELECT and MULTI_SELECT fields');
		}
		return null;
	}

	if (!options || options.length === 0) {
		return err('Options are required for SELECT and MULTI_SELECT fields');
	}
	if (options.length > MAX_OPTIONS) {
		return err(`Options must contain ${MAX_OPTIONS} entries or less`);
	}

	const normalized: string[] = [];
	const seen = new Set<string>();
	for (const option of options) {
		const trimmed = option.trim();
		if (!trimmed) return err('Options must not contain empty values');
		if (trimmed.length > MAX_OPTION_LENGTH) {
			return err(`Options must be ${MAX_OPTION_LENGTH} characters or less`);
		}
		const key = trimmed.toLowerCase();
		if (seen.has(key)) return err('Options must not contain duplicates');
		seen.add(key);
		normalized.push(trimmed);
	}

	return normalized;
}

async function getNextCustomFieldSortOrder(projectId: number): Promise<number> {
	const fields = await db
		.select({ sortOrder: customField.sortOrder })
		.from(customField)
		.where(eq(customField.projectId, projectId));
	return fields.length > 0 ? Math.max(...fields.map((field) => field.sortOrder)) + 1 : 0;
}

export function registerCustomFieldTools(server: McpServer, projectId: number) {
	server.tool('list-custom-fields', 'List all custom fields for the project', {}, async () => {
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
	});

	server.tool(
		'create-custom-field',
		'Create a new custom field',
		{
			name: z.string().min(1).max(MAX_NAME_LENGTH).describe('Field name'),
			fieldType: z.enum(FIELD_TYPES).describe('Field type'),
			options: z
				.array(z.string().min(1).max(MAX_OPTION_LENGTH))
				.max(MAX_OPTIONS)
				.optional()
				.describe('Options for SELECT/MULTI_SELECT types'),
			required: z.boolean().optional().describe('Is this field required (default: false)')
		},
		async ({ name, fieldType, options, required }) => {
			const creator = await requireProjectCreator(projectId);
			if (typeof creator !== 'string') return creator;

			const fieldName = validateFieldName(name);
			if (typeof fieldName !== 'string') return fieldName;

			const normalizedOptions = validateOptions(fieldType, options);
			if (normalizedOptions && !Array.isArray(normalizedOptions)) return normalizedOptions;

			const existing = await db.query.customField.findFirst({
				where: and(eq(customField.projectId, projectId), eq(customField.name, fieldName))
			});
			if (existing) return err('Custom field name already exists');

			const sortOrder = await getNextCustomFieldSortOrder(projectId);

			const [created] = await db
				.insert(customField)
				.values({
					projectId,
					name: fieldName,
					fieldType,
					options: normalizedOptions,
					required: required ?? false,
					sortOrder,
					createdBy: creator
				})
				.returning();

			return ok(created);
		}
	);

	server.tool(
		'delete-custom-field',
		'Delete a custom field by ID',
		{ fieldId: mcpPositiveIdSchema.describe('Custom field ID') },
		async ({ fieldId }) => {
			const f = await db.query.customField.findFirst({
				where: and(eq(customField.id, fieldId), eq(customField.projectId, projectId))
			});
			if (!f) return err('Custom field not found');

			await db
				.delete(customField)
				.where(and(eq(customField.id, fieldId), eq(customField.projectId, projectId)));
			return ok({ success: true, deletedId: fieldId });
		}
	);
}
