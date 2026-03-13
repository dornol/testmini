import type { PageServerLoad } from './$types';
import { db, col } from '$lib/server/db';
import { project, teamMember, user } from '$lib/server/db/schema';
import { eq, sql } from 'drizzle-orm';
import { loadTeamMembers } from '$lib/server/queries';

export const load: PageServerLoad = async ({ params }) => {
	const teamId = Number(params.teamId);

	const [teamProjects, members] = await Promise.all([
		db
			.select({
				id: project.id,
				name: project.name,
				description: project.description,
				active: project.active,
				createdAt: project.createdAt,
				memberCount: sql<number>`(select count(*)::int from project_member where project_id = ${col(project.id)})`.as(
					'member_count'
				)
			})
			.from(project)
			.where(eq(project.teamId, teamId))
			.orderBy(project.name),
		loadTeamMembers(teamId)
	]);

	return { teamProjects, members };
};
