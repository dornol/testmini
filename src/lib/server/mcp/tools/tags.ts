import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { testCase, tag, testCaseTag } from '$lib/server/db/schema';
import { ok, err, requireProjectCreator } from '../helpers';
import { eq, and } from 'drizzle-orm';

export function registerTagTools(server: McpServer, projectId: number) {
	server.tool(
		'list-tags',
		'List all tags for the project',
		{},
		async () => {
			const tags = await db
				.select({ id: tag.id, name: tag.name, color: tag.color })
				.from(tag)
				.where(eq(tag.projectId, projectId));

			return ok(tags);
		}
	);

	server.tool(
		'create-tag',
		'Create a new tag',
		{
			name: z.string().describe('Tag name'),
			color: z.string().optional().describe('Tag color hex (default: #6b7280)')
		},
		async ({ name, color }) => {
			const creator = await requireProjectCreator(projectId);
			if (typeof creator !== 'string') return creator;

			const [created] = await db
				.insert(tag)
				.values({ projectId, name, color: color ?? '#6b7280', createdBy: creator })
				.returning();

			return ok(created);
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
			if (!t) return err('Tag not found');

			await db.delete(testCaseTag).where(eq(testCaseTag.tagId, tagId));
			await db.delete(tag).where(eq(tag.id, tagId));
			return ok({ success: true, deletedId: tagId });
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
			if (!tc) return err('Test case not found');

			const t = await db.query.tag.findFirst({
				where: and(eq(tag.id, tagId), eq(tag.projectId, projectId))
			});
			if (!t) return err('Tag not found');

			await db
				.insert(testCaseTag)
				.values({ testCaseId, tagId })
				.onConflictDoNothing();

			return ok({ success: true, testCaseId, tagId });
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

			return ok({ success: true, testCaseId, tagId });
		}
	);
}
