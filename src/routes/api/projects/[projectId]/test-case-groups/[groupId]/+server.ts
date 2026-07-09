import { json, error } from '@sveltejs/kit';
import { conflict } from '$lib/server/errors';
import { db } from '$lib/server/db';
import { testCaseGroup } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { parseJsonBody, parseId } from '$lib/server/auth-utils';
import { withProjectRole } from '$lib/server/api-handler';
import { validateUpdateTestCaseGroupInput } from '$lib/server/test-case-group-validation';

export const PATCH = withProjectRole(
	['PROJECT_ADMIN', 'QA', 'DEV'],
	async ({ params, request, projectId }) => {
		const groupId = parseId(params.groupId, 'group ID');

		const updatesOrError = validateUpdateTestCaseGroupInput(await parseJsonBody(request));
		if (updatesOrError instanceof Response) return updatesOrError;

		const group = await db.query.testCaseGroup.findFirst({
			where: and(eq(testCaseGroup.id, groupId), eq(testCaseGroup.projectId, projectId))
		});

		if (!group) {
			error(404, 'Group not found');
		}

		const updates: Partial<{ name: string; color: string | null }> = {};

		if (updatesOrError.name !== undefined) {
			const name = updatesOrError.name;
			// Check uniqueness
			const existing = await db.query.testCaseGroup.findFirst({
				where: (g, { and: a, eq: e }) => a(e(g.projectId, projectId), e(g.name, name))
			});
			if (existing && existing.id !== groupId) {
				return conflict('A group with this name already exists');
			}
			updates.name = name;
		}

		if ('color' in updatesOrError) {
			updates.color = updatesOrError.color ?? null;
		}

		if (Object.keys(updates).length > 0) {
			const [updated] = await db
				.update(testCaseGroup)
				.set(updates)
				.where(and(eq(testCaseGroup.id, groupId), eq(testCaseGroup.projectId, projectId)))
				.returning();
			if (!updated) {
				error(404, 'Group not found');
			}

			return json(updated);
		}

		return json(group);
	}
);

export const DELETE = withProjectRole(['PROJECT_ADMIN'], async ({ params, projectId }) => {
	const groupId = parseId(params.groupId, 'group ID');

	const group = await db.query.testCaseGroup.findFirst({
		where: and(eq(testCaseGroup.id, groupId), eq(testCaseGroup.projectId, projectId))
	});

	if (!group) {
		error(404, 'Group not found');
	}

	// FK SET NULL handles moving TCs to uncategorized
	const [deleted] = await db
		.delete(testCaseGroup)
		.where(and(eq(testCaseGroup.id, groupId), eq(testCaseGroup.projectId, projectId)))
		.returning({ id: testCaseGroup.id });
	if (!deleted) {
		error(404, 'Group not found');
	}

	return json({ success: true });
});
