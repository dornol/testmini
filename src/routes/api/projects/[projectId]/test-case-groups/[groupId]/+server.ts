import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { testCaseGroup } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireAuth, requireProjectRole, parseJsonBody } from '$lib/server/auth-utils';

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	const authUser = requireAuth(locals);
	const projectId = Number(params.projectId);
	const groupId = Number(params.groupId);
	await requireProjectRole(authUser, projectId, ['PROJECT_ADMIN', 'QA', 'DEV']);

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
			return json({ error: 'Name cannot be empty' }, { status: 400 });
		}
		// Check uniqueness
		const existing = await db.query.testCaseGroup.findFirst({
			where: (g, { and: a, eq: e }) =>
				a(e(g.projectId, projectId), e(g.name, trimmed))
		});
		if (existing && existing.id !== groupId) {
			return json({ error: 'A group with this name already exists' }, { status: 409 });
		}
		updates.name = trimmed;
	}

	if (color !== undefined) {
		updates.color = color;
	}

	if (Object.keys(updates).length > 0) {
		await db
			.update(testCaseGroup)
			.set(updates)
			.where(eq(testCaseGroup.id, groupId));
	}

	return json({ success: true });
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	const authUser = requireAuth(locals);
	const projectId = Number(params.projectId);
	const groupId = Number(params.groupId);
	await requireProjectRole(authUser, projectId, ['PROJECT_ADMIN']);

	const group = await db.query.testCaseGroup.findFirst({
		where: and(eq(testCaseGroup.id, groupId), eq(testCaseGroup.projectId, projectId))
	});

	if (!group) {
		error(404, 'Group not found');
	}

	// FK SET NULL handles moving TCs to uncategorized
	await db.delete(testCaseGroup).where(eq(testCaseGroup.id, groupId));

	return json({ success: true });
};
