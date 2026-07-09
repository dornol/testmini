import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { testCase, tag, testCaseTag } from '$lib/server/db/schema';
import { ok, err, requireProjectCreator, mcpPositiveIdSchema } from '../helpers';
import { eq, and } from 'drizzle-orm';
import { createTagSchema, updateTagSchema } from '$lib/schemas/tag.schema';

function firstValidationError(error: { issues: Array<{ message: string }> }): string {
	return error.issues[0]?.message ?? 'Invalid tag';
}

export function registerTagTools(server: McpServer, projectId: number) {
	server.tool('list-tags', 'List all tags for the project', {}, async () => {
		const tags = await db
			.select({ id: tag.id, name: tag.name, color: tag.color })
			.from(tag)
			.where(eq(tag.projectId, projectId));

		return ok(tags);
	});

	server.tool(
		'create-tag',
		'Create a new tag',
		{
			name: z.string().min(1).max(50).describe('Tag name'),
			color: z.string().optional().describe('Tag color hex (default: #6b7280)')
		},
		async ({ name, color }) => {
			const creator = await requireProjectCreator(projectId);
			if (typeof creator !== 'string') return creator;

			const parsed = createTagSchema.safeParse({
				name: name.trim(),
				color: color?.trim() ?? '#6b7280'
			});
			if (!parsed.success) return err(firstValidationError(parsed.error));

			const existing = await db.query.tag.findFirst({
				where: and(eq(tag.projectId, projectId), eq(tag.name, parsed.data.name))
			});
			if (existing) return err('Tag name already exists');

			const [created] = await db
				.insert(tag)
				.values({
					projectId,
					name: parsed.data.name,
					color: parsed.data.color,
					createdBy: creator
				})
				.returning();

			return ok(created);
		}
	);

	server.tool(
		'delete-tag',
		'Delete a tag by ID',
		{ tagId: mcpPositiveIdSchema.describe('Tag ID') },
		async ({ tagId }) => {
			const t = await db.query.tag.findFirst({
				where: and(eq(tag.id, tagId), eq(tag.projectId, projectId))
			});
			if (!t) return err('Tag not found');

			await db.delete(testCaseTag).where(eq(testCaseTag.tagId, tagId));
			await db.delete(tag).where(and(eq(tag.id, tagId), eq(tag.projectId, projectId)));
			return ok({ success: true, deletedId: tagId });
		}
	);

	server.tool(
		'add-tag-to-test-case',
		'Add a tag to a test case',
		{
			testCaseId: mcpPositiveIdSchema.describe('Test case ID'),
			tagId: mcpPositiveIdSchema.describe('Tag ID')
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

			await db.insert(testCaseTag).values({ testCaseId, tagId }).onConflictDoNothing();

			return ok({ success: true, testCaseId, tagId });
		}
	);

	server.tool(
		'remove-tag-from-test-case',
		'Remove a tag from a test case',
		{
			testCaseId: mcpPositiveIdSchema.describe('Test case ID'),
			tagId: mcpPositiveIdSchema.describe('Tag ID')
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
				.delete(testCaseTag)
				.where(and(eq(testCaseTag.testCaseId, testCaseId), eq(testCaseTag.tagId, tagId)));

			return ok({ success: true, testCaseId, tagId });
		}
	);

	server.tool(
		'update-tag',
		'Update a tag name or color',
		{
			tagId: mcpPositiveIdSchema.describe('Tag ID'),
			name: z.string().min(1).max(50).optional().describe('New name'),
			color: z.string().optional().describe('New color hex')
		},
		async ({ tagId, name, color }) => {
			if (name === undefined && color === undefined) return err('No fields to update');

			const t = await db.query.tag.findFirst({
				where: and(eq(tag.id, tagId), eq(tag.projectId, projectId))
			});
			if (!t) return err('Tag not found');

			const parsed = updateTagSchema.safeParse({
				tagId,
				name: name?.trim() ?? t.name,
				color: color?.trim() ?? t.color
			});
			if (!parsed.success) return err(firstValidationError(parsed.error));

			if (parsed.data.name !== t.name) {
				const duplicate = await db.query.tag.findFirst({
					where: and(eq(tag.projectId, projectId), eq(tag.name, parsed.data.name))
				});
				if (duplicate && duplicate.id !== tagId) return err('Tag name already exists');
			}

			const updates: Record<string, unknown> = {};
			if (name !== undefined) updates.name = parsed.data.name;
			if (color !== undefined) updates.color = parsed.data.color;

			const [updated] = await db
				.update(tag)
				.set(updates)
				.where(and(eq(tag.id, tagId), eq(tag.projectId, projectId)))
				.returning();
			return ok(updated);
		}
	);
}
