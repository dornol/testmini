import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { testCase, testCaseGroup } from '$lib/server/db/schema';
import { ok, err, requireProjectCreator, mcpPositiveIdSchema } from '../helpers';
import { eq, and, sql } from 'drizzle-orm';
import {
	validateCreateTestCaseGroupInput,
	validateUpdateTestCaseGroupInput
} from '$lib/server/test-case-group-validation';

async function mcpValidationError(
	response: Response,
	fallback: string
): Promise<ReturnType<typeof err>> {
	const body = (await response.json().catch(() => null)) as { error?: string } | null;
	return err(body?.error ?? fallback);
}

export function registerGroupTools(server: McpServer, projectId: number) {
	server.tool('list-groups', 'List test case groups (sections)', {}, async () => {
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
	});

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

			const groupOrError = validateCreateTestCaseGroupInput({ name, color });
			if (groupOrError instanceof Response) {
				return mcpValidationError(groupOrError, 'Invalid group');
			}

			const existing = await db.query.testCaseGroup.findFirst({
				where: (g, { and: a, eq: e }) => a(e(g.projectId, projectId), e(g.name, groupOrError.name))
			});
			if (existing) return err('A group with this name already exists');

			const [maxResult] = await db
				.select({ maxOrder: sql<number>`coalesce(max(${testCaseGroup.sortOrder}), 0)` })
				.from(testCaseGroup)
				.where(eq(testCaseGroup.projectId, projectId));

			const [created] = await db
				.insert(testCaseGroup)
				.values({
					projectId,
					name: groupOrError.name,
					sortOrder: (maxResult?.maxOrder ?? 0) + 1000,
					color: groupOrError.color,
					createdBy: creator
				})
				.returning();

			if (!created) return err('Failed to create group');
			return ok(created);
		}
	);

	server.tool(
		'delete-group',
		'Delete a test case group',
		{ groupId: mcpPositiveIdSchema.describe('Group ID') },
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

			const [deleted] = await db
				.delete(testCaseGroup)
				.where(and(eq(testCaseGroup.id, groupId), eq(testCaseGroup.projectId, projectId)))
				.returning({ id: testCaseGroup.id });
			if (!deleted) return err('Group not found');
			return ok({ success: true, deletedId: groupId });
		}
	);

	server.tool(
		'update-group',
		'Update a test case group name or color',
		{
			groupId: mcpPositiveIdSchema.describe('Group ID'),
			name: z.string().optional().describe('New name'),
			color: z.string().nullable().optional().describe('New color hex')
		},
		async ({ groupId, name, color }) => {
			const input: Record<string, unknown> = {};
			if (name !== undefined) input.name = name;
			if (color !== undefined) input.color = color;
			const updatesOrError = validateUpdateTestCaseGroupInput(input);
			if (updatesOrError instanceof Response) {
				return mcpValidationError(updatesOrError, 'Invalid group');
			}

			const g = await db.query.testCaseGroup.findFirst({
				where: and(eq(testCaseGroup.id, groupId), eq(testCaseGroup.projectId, projectId))
			});
			if (!g) return err('Group not found');

			if (updatesOrError.name !== undefined) {
				const name = updatesOrError.name;
				const existing = await db.query.testCaseGroup.findFirst({
					where: (group, { and: a, eq: e }) => a(e(group.projectId, projectId), e(group.name, name))
				});
				if (existing && existing.id !== groupId) {
					return err('A group with this name already exists');
				}
			}

			const updates: Record<string, unknown> = {};
			if (updatesOrError.name !== undefined) updates.name = updatesOrError.name;
			if ('color' in updatesOrError) updates.color = updatesOrError.color ?? null;

			if (Object.keys(updates).length === 0) return err('No fields to update');

			const [updated] = await db
				.update(testCaseGroup)
				.set(updates)
				.where(and(eq(testCaseGroup.id, groupId), eq(testCaseGroup.projectId, projectId)))
				.returning();
			if (!updated) return err('Group not found');
			return ok(updated);
		}
	);
}
