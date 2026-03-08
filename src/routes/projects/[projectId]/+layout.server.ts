import type { LayoutServerLoad } from './$types';
import { redirect, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { project, projectMember } from '$lib/server/db/schema';
import { eq, and, count, sql } from 'drizzle-orm';
import { requireAuth, requireProjectAccess } from '$lib/server/auth-utils';
import { loadProjectPriorities, loadProjectEnvironments } from '$lib/server/queries';

export const load: LayoutServerLoad = async ({ locals, params }) => {
	const user = requireAuth(locals);
	const projectId = Number(params.projectId);

	if (isNaN(projectId)) {
		error(400, 'Invalid project ID');
	}

	const { role: userRole } = await requireProjectAccess(user, projectId);

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

	const [projectPriorities, projectEnvironments] = await Promise.all([
		loadProjectPriorities(projectId),
		loadProjectEnvironments(projectId)
	]);

	return {
		project: result[0],
		userRole,
		projectPriorities,
		projectEnvironments
	};
};
