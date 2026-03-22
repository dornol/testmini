import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { module, moduleTestCase, testCase } from '$lib/server/db/schema';
import { ok, err, requireProjectCreator } from '../helpers';
import { eq, and, sql } from 'drizzle-orm';

export function registerModuleTools(server: McpServer, projectId: number) {
	server.tool(
		'list-modules',
		'List all modules for the project',
		{},
		async () => {
			const modules = await db.query.module.findMany({
				where: eq(module.projectId, projectId),
				columns: { id: true, name: true, description: true, parentModuleId: true, sortOrder: true }
			});

			return ok(modules);
		}
	);

	server.tool(
		'create-module',
		'Create a new module',
		{
			name: z.string().describe('Module name'),
			description: z.string().optional().describe('Module description'),
			parentModuleId: z.number().optional().describe('Parent module ID for nesting')
		},
		async ({ name, description, parentModuleId }) => {
			const creator = await requireProjectCreator(projectId);
			if (typeof creator !== 'string') return creator;

			if (parentModuleId) {
				const parent = await db.query.module.findFirst({
					where: and(eq(module.id, parentModuleId), eq(module.projectId, projectId))
				});
				if (!parent) return err('Parent module not found');
			}

			const [created] = await db
				.insert(module)
				.values({
					projectId,
					name,
					description,
					parentModuleId: parentModuleId ?? null,
					createdBy: creator
				})
				.returning();

			return ok(created);
		}
	);

	server.tool(
		'delete-module',
		'Delete a module by ID',
		{ moduleId: z.number().describe('Module ID') },
		async ({ moduleId }) => {
			const m = await db.query.module.findFirst({
				where: and(eq(module.id, moduleId), eq(module.projectId, projectId))
			});
			if (!m) return err('Module not found');

			await db.delete(module).where(eq(module.id, moduleId));
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
}
