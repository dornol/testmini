import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { module, moduleTestCase, testCase } from '$lib/server/db/schema';
import { ok, err, requireProjectCreator, mcpPositiveIdSchema, mcpIdListSchema } from '../helpers';
import { eq, and, sql, inArray } from 'drizzle-orm';
import { createModuleSchema, updateModuleSchema } from '$lib/schemas/module.schema';

function firstValidationError(error: { issues: Array<{ message: string }> }): string {
	return error.issues[0]?.message ?? 'Invalid module';
}

async function validateParentModule(
	parentModuleId: number | null | undefined,
	projectId: number,
	moduleId?: number
) {
	if (parentModuleId === null || parentModuleId === undefined) return undefined;
	if (parentModuleId === moduleId) return err('Module cannot be its own parent');

	const parent = await db.query.module.findFirst({
		where: and(eq(module.id, parentModuleId), eq(module.projectId, projectId)),
		columns: { id: true }
	});
	if (!parent) return err('Parent module not found');
}

export function registerModuleTools(server: McpServer, projectId: number) {
	server.tool('list-modules', 'List all modules for the project', {}, async () => {
		const modules = await db.query.module.findMany({
			where: eq(module.projectId, projectId),
			columns: { id: true, name: true, description: true, parentModuleId: true, sortOrder: true }
		});

		return ok(modules);
	});

	server.tool(
		'create-module',
		'Create a new module',
		{
			name: z.string().describe('Module name'),
			description: z.string().optional().describe('Module description'),
			parentModuleId: mcpPositiveIdSchema.optional().describe('Parent module ID for nesting')
		},
		async ({ name, description, parentModuleId }) => {
			const creator = await requireProjectCreator(projectId);
			if (typeof creator !== 'string') return creator;

			const parsed = createModuleSchema.safeParse({ name, description, parentModuleId });
			if (!parsed.success) return err(firstValidationError(parsed.error));

			const parentError = await validateParentModule(parsed.data.parentModuleId, projectId);
			if (parentError) return parentError;

			const [created] = await db
				.insert(module)
				.values({
					projectId,
					name: parsed.data.name,
					description: parsed.data.description ?? null,
					parentModuleId: parsed.data.parentModuleId ?? null,
					createdBy: creator
				})
				.returning();

			if (!created) return err('Failed to create module');
			return ok(created);
		}
	);

	server.tool(
		'delete-module',
		'Delete a module by ID',
		{ moduleId: mcpPositiveIdSchema.describe('Module ID') },
		async ({ moduleId }) => {
			const m = await db.query.module.findFirst({
				where: and(eq(module.id, moduleId), eq(module.projectId, projectId))
			});
			if (!m) return err('Module not found');

			const [deleted] = await db
				.delete(module)
				.where(and(eq(module.id, moduleId), eq(module.projectId, projectId)))
				.returning();
			if (!deleted) return err('Module not found');

			return {
				content: [
					{ type: 'text' as const, text: JSON.stringify({ success: true, deletedId: moduleId }) }
				]
			};
		}
	);

	server.tool(
		'get-module-coverage',
		'Get module coverage stats — count of test cases per module',
		{},
		async () => {
			const rows = await db
				.select({
					moduleId: module.id,
					moduleName: module.name,
					testCaseCount: sql<number>`count(${moduleTestCase.testCaseId})::int`
				})
				.from(module)
				.leftJoin(moduleTestCase, eq(moduleTestCase.moduleId, module.id))
				.where(eq(module.projectId, projectId))
				.groupBy(module.id, module.name);

			return ok(rows);
		}
	);

	server.tool(
		'update-module',
		'Update a module name or description',
		{
			moduleId: mcpPositiveIdSchema.describe('Module ID'),
			name: z.string().optional().describe('New name'),
			description: z.string().nullable().optional().describe('New description'),
			parentModuleId: mcpPositiveIdSchema.nullable().optional().describe('Parent module ID'),
			sortOrder: z.number().optional().describe('Sort order')
		},
		async ({ moduleId, name, description, parentModuleId, sortOrder }) => {
			const m = await db.query.module.findFirst({
				where: and(eq(module.id, moduleId), eq(module.projectId, projectId))
			});
			if (!m) return err('Module not found');

			const parsed = updateModuleSchema.safeParse({
				name,
				description,
				parentModuleId,
				sortOrder
			});
			if (!parsed.success) return err(firstValidationError(parsed.error));

			const parentError = await validateParentModule(
				parsed.data.parentModuleId,
				projectId,
				moduleId
			);
			if (parentError) return parentError;

			const updates: Record<string, unknown> = {};
			if (parsed.data.name !== undefined) updates.name = parsed.data.name;
			if (parsed.data.description !== undefined) updates.description = parsed.data.description;
			if (parsed.data.parentModuleId !== undefined)
				updates.parentModuleId = parsed.data.parentModuleId;
			if (parsed.data.sortOrder !== undefined) updates.sortOrder = parsed.data.sortOrder;

			if (Object.keys(updates).length === 0) return err('No fields to update');

			const [updated] = await db
				.update(module)
				.set(updates)
				.where(and(eq(module.id, moduleId), eq(module.projectId, projectId)))
				.returning();
			if (!updated) return err('Module not found');
			return ok(updated);
		}
	);

	server.tool(
		'add-module-test-cases',
		'Add test cases to a module',
		{
			moduleId: mcpPositiveIdSchema.describe('Module ID'),
			testCaseIds: mcpIdListSchema.describe('Test case IDs to add')
		},
		async ({ moduleId, testCaseIds }) => {
			const m = await db.query.module.findFirst({
				where: and(eq(module.id, moduleId), eq(module.projectId, projectId))
			});
			if (!m) return err('Module not found');

			const uniqueTestCaseIds = [...new Set(testCaseIds)];
			const validCases = await db
				.select({ id: testCase.id })
				.from(testCase)
				.where(and(eq(testCase.projectId, projectId), inArray(testCase.id, uniqueTestCaseIds)));
			if (validCases.length !== uniqueTestCaseIds.length) return err('Test case not found');

			const values = testCaseIds.map((tcId) => ({ moduleId, testCaseId: tcId }));
			const inserted = await db
				.insert(moduleTestCase)
				.values(values)
				.onConflictDoNothing()
				.returning({ id: moduleTestCase.id });
			return ok({ success: true, moduleId, addedCount: inserted.length });
		}
	);

	server.tool(
		'remove-module-test-cases',
		'Remove test cases from a module',
		{
			moduleId: mcpPositiveIdSchema.describe('Module ID'),
			testCaseIds: mcpIdListSchema.describe('Test case IDs to remove')
		},
		async ({ moduleId, testCaseIds }) => {
			const m = await db.query.module.findFirst({
				where: and(eq(module.id, moduleId), eq(module.projectId, projectId))
			});
			if (!m) return err('Module not found');

			const uniqueTestCaseIds = [...new Set(testCaseIds)];
			const validCases = await db
				.select({ id: testCase.id })
				.from(testCase)
				.where(and(eq(testCase.projectId, projectId), inArray(testCase.id, uniqueTestCaseIds)));
			if (validCases.length !== uniqueTestCaseIds.length) return err('Test case not found');

			const deleted = await db
				.delete(moduleTestCase)
				.where(
					and(
						eq(moduleTestCase.moduleId, moduleId),
						inArray(moduleTestCase.testCaseId, testCaseIds)
					)
				)
				.returning({ id: moduleTestCase.id });
			return ok({ success: true, moduleId, removedCount: deleted.length });
		}
	);
}
