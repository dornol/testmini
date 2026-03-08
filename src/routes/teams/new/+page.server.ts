import type { PageServerLoad, Actions } from './$types';
import { redirect, fail } from '@sveltejs/kit';
import { superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import { createTeamSchema, type CreateTeamInput } from '$lib/schemas/team.schema';
import { db } from '$lib/server/db';
import { team, teamMember } from '$lib/server/db/schema';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		redirect(302, '/auth/login');
	}

	// @ts-expect-error zod 3.x safeParse return type mismatch with superforms adapter
	const form = await superValidate(zod(createTeamSchema));
	return { form };
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		if (!locals.user) {
			redirect(302, '/auth/login');
		}

		// @ts-expect-error zod 3.x safeParse return type mismatch with superforms adapter
		const form = await superValidate(request, zod(createTeamSchema));

		if (!form.valid) {
			return fail(400, { form });
		}

		const { name, description } = form.data as CreateTeamInput;

		const newTeam = await db.transaction(async (tx) => {
			const [created] = await tx
				.insert(team)
				.values({
					name,
					description: description || null,
					createdBy: locals.user!.id
				})
				.returning();

			await tx.insert(teamMember).values({
				teamId: created.id,
				userId: locals.user!.id,
				role: 'OWNER'
			});

			return created;
		});

		redirect(303, `/teams/${newTeam.id}`);
	}
};
