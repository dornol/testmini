import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { testCase, testCaseGroup } from '$lib/server/db/schema';
import { ok, err, requireProjectCreator } from '../helpers';
import { eq, and } from 'drizzle-orm';

export function registerGroupTools(server: McpServer, projectId: number) {
	server.tool(
		'list-groups',
		'List test case groups (sections)',
		{},
		async () => {
			const groups = await db
				.select({
					id: testCaseGroup.id,
					name: testCaseGroup.name,
					sortOrder: testCaseGroup.sortOrder,
					color: testCaseGroup.color
				})
				.from(testCaseGroup)
				.where(eq(testCaseGroup.projectId, projectId))
				.orderBy(testCaseGroup.sortOrder);

			return ok(groups);
		}
	);

	server.tool(
		'create-group',
		'Create a test case group (section)',
		{
			name: z.string().describe('Group name'),
			color: z.string().optional().describe('Group color hex')
		},
		async ({ name, color }) => {
			const creator = await requireProjectCreator(projectId);
			if (typeof creator !== 'string') return creator;

			const [created] = await db
				.insert(testCaseGroup)
				.values({ projectId, name, color: color ?? null, createdBy: creator })
				.returning();

			return ok(created);
		}
	);

	server.tool(
		'delete-group',
		'Delete a test case group',
		{ groupId: z.number().describe('Group ID') },
		async ({ groupId }) => {
			const g = await db.query.testCaseGroup.findFirst({
				where: and(eq(testCaseGroup.id, groupId), eq(testCaseGroup.projectId, projectId))
			});
			if (!g) return err('Group not found');

			// Unassign test cases from this group
			await db
				.update(testCase)
				.set({ groupId: null })
				.where(and(eq(testCase.projectId, projectId), eq(testCase.groupId, groupId)));

			await db.delete(testCaseGroup).where(eq(testCaseGroup.id, groupId));
			return ok({ success: true, deletedId: groupId });
		}
	);

	server.tool(
		'update-group',
		'Update a test case group name or color',
		{
			groupId: z.number().describe('Group ID'),
			name: z.string().optional().describe('New name'),
			color: z.string().optional().describe('New color hex')
		},
		async ({ groupId, name, color }) => {
			const g = await db.query.testCaseGroup.findFirst({
				where: and(eq(testCaseGroup.id, groupId), eq(testCaseGroup.projectId, projectId))
			});
			if (!g) return err('Group not found');

			const updates: Record<string, unknown> = {};
			if (name !== undefined) updates.name = name;
			if (color !== undefined) updates.color = color;

			const [updated] = await db.update(testCaseGroup).set(updates).where(eq(testCaseGroup.id, groupId)).returning();
			return ok(updated);
		}
	);
}
