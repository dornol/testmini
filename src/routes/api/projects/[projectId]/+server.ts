import { json, error } from '@sveltejs/kit';
import { db, col } from '$lib/server/db';
import { project, projectMember } from '$lib/server/db/schema';
import { parseJsonObjectBody } from '$lib/server/auth-utils';
import { withProjectAccess, withProjectRole } from '$lib/server/api-handler';
import { updateProjectSchema } from '$lib/schemas/project.schema';
import { badRequest, validationError } from '$lib/server/errors';
import { eq, count, sql } from 'drizzle-orm';

export const GET = withProjectAccess(async ({ projectId }) => {
	const result = await db
		.select({
			id: project.id,
			name: project.name,
			description: project.description,
			active: project.active,
			createdBy: project.createdBy,
			createdAt: project.createdAt,
			memberCount:
				sql<number>`(select count(*)::int from project_member where project_id = ${col(project.id)})`.as(
					'member_count'
				)
		})
		.from(project)
		.where(eq(project.id, projectId));

	if (!result[0]) {
		error(404, 'Project not found');
	}

	return json({ data: result[0] });
});

export const PATCH = withProjectRole(['PROJECT_ADMIN'], async ({ request, projectId }) => {
	const body = await parseJsonObjectBody(request);
	const result = updateProjectSchema.safeParse(body);

	if (!result.success) {
		return validationError(
			'Validation failed',
			result.error.flatten().fieldErrors as Record<string, string[]>
		);
	}

	const updates: Record<string, unknown> = {};
	if (result.data.name !== undefined) updates.name = result.data.name;
	if (result.data.description !== undefined) updates.description = result.data.description || null;

	if (Object.keys(updates).length === 0) {
		return badRequest('No fields to update');
	}

	const [updated] = await db
		.update(project)
		.set(updates)
		.where(eq(project.id, projectId))
		.returning();

	if (!updated) {
		error(404, 'Project not found');
	}

	return json({ data: updated });
});

export const DELETE = withProjectRole(['PROJECT_ADMIN'], async ({ projectId }) => {
	const [deactivated] = await db
		.update(project)
		.set({ active: false })
		.where(eq(project.id, projectId))
		.returning();

	if (!deactivated) {
		error(404, 'Project not found');
	}

	return json({ data: deactivated });
});
