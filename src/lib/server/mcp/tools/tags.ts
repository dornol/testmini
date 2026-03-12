import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { project, testCase, tag, testCaseTag } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';

export function registerTagTools(server: McpServer, projectId: number) {
	server.tool(
		'create-tag',
		'Create a new tag',
		{
			name: z.string().describe('Tag name'),
			color: z.string().optional().describe('Tag color hex (default: #6b7280)')
		},
		async ({ name, color }) => {
			const proj = await db.query.project.findFirst({ where: eq(project.id, projectId) });
			if (!proj) return { content: [{ type: 'text' as const, text: 'Project not found' }], isError: true };

			const [created] = await db
				.insert(tag)
				.values({ projectId, name, color: color ?? '#6b7280', createdBy: proj.createdBy })
				.returning();

			return { content: [{ type: 'text' as const, text: JSON.stringify(created, null, 2) }] };
		}
	);

	server.tool(
		'delete-tag',
		'Delete a tag by ID',
		{ tagId: z.number().describe('Tag ID') },
		async ({ tagId }) => {
			const t = await db.query.tag.findFirst({
				where: and(eq(tag.id, tagId), eq(tag.projectId, projectId))
			});
			if (!t) return { content: [{ type: 'text' as const, text: 'Tag not found' }], isError: true };

			await db.delete(testCaseTag).where(eq(testCaseTag.tagId, tagId));
			await db.delete(tag).where(eq(tag.id, tagId));
			return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, deletedId: tagId }) }] };
		}
	);

	server.tool(
		'add-tag-to-test-case',
		'Add a tag to a test case',
		{
			testCaseId: z.number().describe('Test case ID'),
			tagId: z.number().describe('Tag ID')
		},
		async ({ testCaseId, tagId }) => {
			const tc = await db.query.testCase.findFirst({
				where: and(eq(testCase.id, testCaseId), eq(testCase.projectId, projectId))
			});
			if (!tc) return { content: [{ type: 'text' as const, text: 'Test case not found' }], isError: true };

			const t = await db.query.tag.findFirst({
				where: and(eq(tag.id, tagId), eq(tag.projectId, projectId))
			});
			if (!t) return { content: [{ type: 'text' as const, text: 'Tag not found' }], isError: true };

			await db
				.insert(testCaseTag)
				.values({ testCaseId, tagId })
				.onConflictDoNothing();

			return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, testCaseId, tagId }) }] };
		}
	);

	server.tool(
		'remove-tag-from-test-case',
		'Remove a tag from a test case',
		{
			testCaseId: z.number().describe('Test case ID'),
			tagId: z.number().describe('Tag ID')
		},
		async ({ testCaseId, tagId }) => {
			await db
				.delete(testCaseTag)
				.where(and(eq(testCaseTag.testCaseId, testCaseId), eq(testCaseTag.tagId, tagId)));

			return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, testCaseId, tagId }) }] };
		}
	);
}
