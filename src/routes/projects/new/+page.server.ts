import type { PageServerLoad, Actions } from './$types';
import { redirect, fail } from '@sveltejs/kit';
import { superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import { createProjectSchema, type CreateProjectInput } from '$lib/schemas/project.schema';
import { db } from '$lib/server/db';
import { project, projectMember } from '$lib/server/db/schema';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		redirect(302, '/auth/login');
	}

	// @ts-expect-error zod 3.x safeParse return type mismatch with superforms adapter
	const form = await superValidate(zod(createProjectSchema));
	return { form };
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		if (!locals.user) {
			redirect(302, '/auth/login');
		}

		// @ts-expect-error zod 3.x safeParse return type mismatch with superforms adapter
		const form = await superValidate(request, zod(createProjectSchema));

		if (!form.valid) {
			return fail(400, { form });
		}

		const { name, description } = form.data as CreateProjectInput;

		const newProject = await db.transaction(async (tx) => {
			const [created] = await tx
				.insert(project)
				.values({
					name,
					description: description || null,
					createdBy: locals.user!.id
				})
				.returning();

			await tx.insert(projectMember).values({
				projectId: created.id,
				userId: locals.user!.id,
				role: 'PROJECT_ADMIN'
			});

			return created;
		});

		redirect(303, `/projects/${newProject.id}`);
	}
};
