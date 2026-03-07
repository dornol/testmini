import { json, error } from '@sveltejs/kit';
import { badRequest, conflict } from '$lib/server/errors';
import { db } from '$lib/server/db';
import { testCaseGroup } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { parseJsonBody } from '$lib/server/auth-utils';
import { withProjectRole } from '$lib/server/api-handler';

export const PATCH = withProjectRole(['PROJECT_ADMIN', 'QA', 'DEV'], async ({ params, request, projectId }) => {
	const groupId = Number(params.groupId);

	const body = await parseJsonBody(request);
	const { name, color } = body as { name?: string; color?: string | null };

	const group = await db.query.testCaseGroup.findFirst({
		where: and(eq(testCaseGroup.id, groupId), eq(testCaseGroup.projectId, projectId))
	});

	if (!group) {
		error(404, 'Group not found');
	}

	const updates: Partial<{ name: string; color: string | null }> = {};

	if (name !== undefined) {
		const trimmed = name.trim();
		if (!trimmed) {
			return badRequest('Name cannot be empty');
		}
		// Check uniqueness
		const existing = await db.query.testCaseGroup.findFirst({
			where: (g, { and: a, eq: e }) =>
				a(e(g.projectId, projectId), e(g.name, trimmed))
		});
		if (existing && existing.id !== groupId) {
			return conflict('A group with this name already exists');
		}
		updates.name = trimmed;
	}

	if (color !== undefined) {
		if (color !== null && !/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color)) {
			return badRequest('Invalid HEX color format');
		}
		updates.color = color;
	}

	if (Object.keys(updates).length > 0) {
		await db
			.update(testCaseGroup)
			.set(updates)
			.where(eq(testCaseGroup.id, groupId));
	}

	const updated = await db.query.testCaseGroup.findFirst({
		where: and(eq(testCaseGroup.id, groupId), eq(testCaseGroup.projectId, projectId))
	});

	return json(updated);
});

export const DELETE = withProjectRole(['PROJECT_ADMIN'], async ({ params, projectId }) => {
	const groupId = Number(params.groupId);

	const group = await db.query.testCaseGroup.findFirst({
		where: and(eq(testCaseGroup.id, groupId), eq(testCaseGroup.projectId, projectId))
	});

	if (!group) {
		error(404, 'Group not found');
	}

	// FK SET NULL handles moving TCs to uncategorized
	await db.delete(testCaseGroup).where(eq(testCaseGroup.id, groupId));

	return json({ success: true });
});
