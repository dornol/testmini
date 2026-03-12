import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { project, testCase, testCaseGroup } from '$lib/server/db/schema';
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

			return { content: [{ type: 'text' as const, text: JSON.stringify(groups, null, 2) }] };
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
			const proj = await db.query.project.findFirst({ where: eq(project.id, projectId) });
			if (!proj) return { content: [{ type: 'text' as const, text: 'Project not found' }], isError: true };

			const [created] = await db
				.insert(testCaseGroup)
				.values({ projectId, name, color: color ?? null, createdBy: proj.createdBy })
				.returning();

			return { content: [{ type: 'text' as const, text: JSON.stringify(created, null, 2) }] };
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
			if (!g) return { content: [{ type: 'text' as const, text: 'Group not found' }], isError: true };

			// Unassign test cases from this group
			await db
				.update(testCase)
				.set({ groupId: null })
				.where(and(eq(testCase.projectId, projectId), eq(testCase.groupId, groupId)));

			await db.delete(testCaseGroup).where(eq(testCaseGroup.id, groupId));
			return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, deletedId: groupId }) }] };
		}
	);
}
