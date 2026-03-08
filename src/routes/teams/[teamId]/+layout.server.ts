import type { LayoutServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { team, teamMember } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireAuth, isGlobalAdmin } from '$lib/server/auth-utils';

export const load: LayoutServerLoad = async ({ locals, params }) => {
	const user = requireAuth(locals);
	const teamId = Number(params.teamId);

	if (isNaN(teamId)) {
		error(400, 'Invalid team ID');
	}

	const teamData = await db.query.team.findFirst({
		where: eq(team.id, teamId)
	});

	if (!teamData) {
		error(404, 'Team not found');
	}

	let userTeamRole: string | null = null;

	if (isGlobalAdmin(user)) {
		userTeamRole = 'ADMIN';
	} else {
		const membership = await db.query.teamMember.findFirst({
			where: and(eq(teamMember.teamId, teamId), eq(teamMember.userId, user.id))
		});

		if (!membership) {
			error(403, 'You do not have access to this team');
		}

		userTeamRole = membership.role;
	}

	return {
		team: teamData,
		userTeamRole
	};
};
