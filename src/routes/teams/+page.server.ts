import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { db, col } from '$lib/server/db';
import { team, teamMember } from '$lib/server/db/schema';
import { and, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { isGlobalAdmin } from '$lib/server/auth-utils';

export const load: PageServerLoad = async ({ locals, url }) => {
	const user = locals.user;
	if (!user) redirect(302, '/auth/login');

	const search = (url.searchParams.get('search') ?? '').trim().slice(0, 100);
	const pattern = `%${search.replace(/[\\%_]/g, '\\$&')}%`;
	const membersOnly = isGlobalAdmin(user)
		? undefined
		: inArray(
				team.id,
				db.select({ id: teamMember.teamId }).from(teamMember).where(eq(teamMember.userId, user.id))
			);
	const keyword = search
		? or(ilike(team.name, pattern), ilike(team.description, pattern))
		: undefined;

	const teams = await db
		.select({
			id: team.id,
			name: team.name,
			description: team.description,
			memberCount: sql<number>`(select count(*)::int from team_member where team_id = ${col(team.id)})`,
			projectCount: sql<number>`(select count(*)::int from project where team_id = ${col(team.id)})`
		})
		.from(team)
		.where(and(membersOnly, keyword))
		.orderBy(team.name, team.id);

	return { teams, search };
};
