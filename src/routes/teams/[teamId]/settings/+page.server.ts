import type { PageServerLoad, Actions } from './$types';
import { error, fail, redirect } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { createTeamSchema, updateTeamSchema, type UpdateTeamInput } from '$lib/schemas/team.schema';
import { zodAdapter } from '$lib/server/form-utils';
import { childLogger } from '$lib/server/logger';
import { db } from '$lib/server/db';
import { team, teamMember, project } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireAuth, isGlobalAdmin, parseId } from '$lib/server/auth-utils';

const fullForm = zodAdapter(createTeamSchema);
const partialForm = zodAdapter(updateTeamSchema);
const log = childLogger('team-settings');

export const load: PageServerLoad = async ({ parent }) => {
	const { team: t } = await parent();
	const form = await superValidate({ name: t.name, description: t.description ?? '' }, fullForm);

	return { form };
};

export const actions: Actions = {
	update: async ({ request, locals, params }) => {
		const user = requireAuth(locals);
		const teamId = parseId(params.teamId, 'team ID');

		// Check OWNER or ADMIN
		if (!isGlobalAdmin(user)) {
			const membership = await db.query.teamMember.findFirst({
				where: and(eq(teamMember.teamId, teamId), eq(teamMember.userId, user.id))
			});
			if (!membership || (membership.role !== 'OWNER' && membership.role !== 'ADMIN')) {
				return fail(403, { error: 'Insufficient permissions' });
			}
		}

		const data = await request.formData();
		const form = await superValidate(data, data.has('name') ? fullForm : partialForm);

		if (!form.valid) {
			return fail(400, { form });
		}

		const { name, description } = form.data as UpdateTeamInput;
		let updated;
		try {
			[updated] = await db
				.update(team)
				.set({
					...(name !== undefined && { name }),
					...(description !== undefined && { description: description || null })
				})
				.where(eq(team.id, teamId))
				.returning();
		} catch {
			log.error({ requestId: locals.requestId }, 'Team settings update failed');
			return message(form, 'save_failed', { status: 500 });
		}

		if (!updated) {
			error(404, 'Team not found');
		}

		return message(form, 'Team updated successfully');
	},

	delete: async ({ locals, params }) => {
		const user = requireAuth(locals);
		const teamId = parseId(params.teamId, 'team ID');

		// Only OWNER can delete
		if (!isGlobalAdmin(user)) {
			const membership = await db.query.teamMember.findFirst({
				where: and(eq(teamMember.teamId, teamId), eq(teamMember.userId, user.id))
			});
			if (!membership || membership.role !== 'OWNER') {
				return fail(403, { error: 'Only team owner can delete the team' });
			}
		}

		let deleted;
		try {
			deleted = await db.transaction(async (tx) => {
				// Unassign projects (set teamId to null)
				await tx.update(project).set({ teamId: null }).where(eq(project.teamId, teamId));

				// Delete team (cascade will remove team_member rows)
				const [deletedTeam] = await tx.delete(team).where(eq(team.id, teamId)).returning();
				return deletedTeam;
			});
		} catch {
			log.error({ requestId: locals.requestId }, 'Team deletion transaction failed');
			return fail(500, { deleteFailed: true });
		}
		if (!deleted) {
			error(404, 'Team not found');
		}

		redirect(303, '/teams');
	}
};
