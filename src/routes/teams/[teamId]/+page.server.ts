import type { PageServerLoad } from './$types';
import { db, col } from '$lib/server/db';
import { project } from '$lib/server/db/schema';
import { eq, sql } from 'drizzle-orm';
import { loadTeamMembers } from '$lib/server/queries';
import { isGlobalAdmin, parseId, requireAuth } from '$lib/server/auth-utils';

export const load: PageServerLoad = async ({ params, locals, parent }) => {
	await parent();
	const user = requireAuth(locals);
	const teamId = parseId(params.teamId, 'team ID');

	const [teamProjects, members] = await Promise.all([
		db
			.select({
				id: project.id,
				name: project.name,
				description: project.description,
				active: project.active,
				canOpen: isGlobalAdmin(user)
					? sql<boolean>`true`
					: sql<boolean>`exists (select 1 from project_member where project_id = ${col(project.id)} and user_id = ${user.id})`,
				memberCount:
					sql<number>`(select count(*)::int from project_member where project_id = ${col(project.id)})`.as(
						'member_count'
					)
			})
			.from(project)
			.where(eq(project.teamId, teamId))
			.orderBy(project.name, project.id),
		loadTeamMembers(teamId)
	]);

	return { teamProjects, members };
};
