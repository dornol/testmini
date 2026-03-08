import type { PageServerLoad, Actions } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { updateTeamSchema, type UpdateTeamInput } from '$lib/schemas/team.schema';
import { zodAdapter } from '$lib/server/form-utils';
import { db } from '$lib/server/db';
import { team, teamMember, project } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireAuth, isGlobalAdmin } from '$lib/server/auth-utils';

const adapter = zodAdapter(updateTeamSchema);

export const load: PageServerLoad = async ({ parent }) => {
	const { team: t } = await parent();
	const form = await superValidate(
		{ name: t.name, description: t.description ?? '' },
		adapter
	);

	return { form };
};

export const actions: Actions = {
	update: async ({ request, locals, params }) => {
		const user = requireAuth(locals);
		const teamId = Number(params.teamId);

		// Check OWNER or ADMIN
		if (!isGlobalAdmin(user)) {
			const membership = await db.query.teamMember.findFirst({
				where: and(eq(teamMember.teamId, teamId), eq(teamMember.userId, user.id))
			});
			if (!membership || (membership.role !== 'OWNER' && membership.role !== 'ADMIN')) {
				return fail(403, { error: 'Insufficient permissions' });
			}
		}

		const form = await superValidate(request, adapter);

		if (!form.valid) {
			return fail(400, { form });
		}

		const { name, description } = form.data as UpdateTeamInput;
		await db
			.update(team)
			.set({
				...(name !== undefined && { name }),
				...(description !== undefined && { description: description || null })
			})
			.where(eq(team.id, teamId));

		return message(form, 'Team updated successfully');
	},

	delete: async ({ locals, params }) => {
		const user = requireAuth(locals);
		const teamId = Number(params.teamId);

		// Only OWNER can delete
		if (!isGlobalAdmin(user)) {
			const membership = await db.query.teamMember.findFirst({
				where: and(eq(teamMember.teamId, teamId), eq(teamMember.userId, user.id))
			});
			if (!membership || membership.role !== 'OWNER') {
				return fail(403, { error: 'Only team owner can delete the team' });
			}
		}

		// Unassign projects (set teamId to null)
		await db.update(project).set({ teamId: null }).where(eq(project.teamId, teamId));

		// Delete team (cascade will remove team_member rows)
		await db.delete(team).where(eq(team.id, teamId));

		redirect(303, '/teams');
	}
};
