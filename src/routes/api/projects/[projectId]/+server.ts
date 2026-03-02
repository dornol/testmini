import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { project, projectMember } from '$lib/server/db/schema';
import { requireAuth, requireProjectAccess, requireProjectRole, parseJsonBody } from '$lib/server/auth-utils';
import { updateProjectSchema } from '$lib/schemas/project.schema';
import { eq, count, sql } from 'drizzle-orm';

export const GET: RequestHandler = async ({ locals, params }) => {
	const user = requireAuth(locals);
	const projectId = Number(params.projectId);

	if (isNaN(projectId)) {
		error(400, 'Invalid project ID');
	}

	await requireProjectAccess(user, projectId);

	const result = await db
		.select({
			id: project.id,
			name: project.name,
			description: project.description,
			active: project.active,
			createdBy: project.createdBy,
			createdAt: project.createdAt,
			memberCount: sql<number>`(select count(*) from project_member where project_id = ${project.id})`.as(
				'member_count'
			)
		})
		.from(project)
		.where(eq(project.id, projectId));

	if (!result[0]) {
		error(404, 'Project not found');
	}

	return json({ data: result[0] });
};

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	const user = requireAuth(locals);
	const projectId = Number(params.projectId);

	if (isNaN(projectId)) {
		error(400, 'Invalid project ID');
	}

	await requireProjectRole(user, projectId, ['PROJECT_ADMIN']);

	const body = await parseJsonBody(request);
	const result = updateProjectSchema.safeParse(body);

	if (!result.success) {
		return json({ error: result.error.flatten().fieldErrors }, { status: 400 });
	}

	const [updated] = await db
		.update(project)
		.set({
			name: result.data.name,
			description: result.data.description || null
		})
		.where(eq(project.id, projectId))
		.returning();

	if (!updated) {
		error(404, 'Project not found');
	}

	return json({ data: updated });
};

export const DELETE: RequestHandler = async ({ locals, params }) => {
	const user = requireAuth(locals);
	const projectId = Number(params.projectId);

	if (isNaN(projectId)) {
		error(400, 'Invalid project ID');
	}

	await requireProjectRole(user, projectId, ['PROJECT_ADMIN']);

	const [deactivated] = await db
		.update(project)
		.set({ active: false })
		.where(eq(project.id, projectId))
		.returning();

	if (!deactivated) {
		error(404, 'Project not found');
	}

	return json({ data: deactivated });
};
