import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { db, col } from '$lib/server/db';
import { team, teamMember, project } from '$lib/server/db/schema';
import { eq, count, sql } from 'drizzle-orm';
import { isGlobalAdmin } from '$lib/server/auth-utils';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		redirect(302, '/auth/login');
	}

	const user = locals.user as App.Locals['user'] & { role?: string };

	let teams;

	if (isGlobalAdmin(user!)) {
		teams = await db
			.select({
				id: team.id,
				name: team.name,
				description: team.description,
				createdAt: team.createdAt,
				memberCount: sql<number>`(select count(*)::int from team_member where team_id = ${col(team.id)})`.as(
					'member_count'
				),
				projectCount: sql<number>`(select count(*)::int from project where team_id = ${col(team.id)})`.as(
					'project_count'
				)
			})
			.from(team)
			.orderBy(team.name);
	} else {
		teams = await db
			.select({
				id: team.id,
				name: team.name,
				description: team.description,
				createdAt: team.createdAt,
				memberCount: sql<number>`(select count(*)::int from team_member where team_id = ${col(team.id)})`.as(
					'member_count'
				),
				projectCount: sql<number>`(select count(*)::int from project where team_id = ${col(team.id)})`.as(
					'project_count'
				)
			})
			.from(teamMember)
			.innerJoin(team, eq(teamMember.teamId, team.id))
			.where(eq(teamMember.userId, user!.id))
			.orderBy(team.name);
	}

	return { teams };
};
