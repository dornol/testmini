import type { PageServerLoad, Actions } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import { updateProjectSchema, type UpdateProjectInput } from '$lib/schemas/project.schema';
import { db } from '$lib/server/db';
import { project } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { requireAuth, requireProjectRole } from '$lib/server/auth-utils';

// @ts-ignore zod 3.24 type mismatch with superforms adapter
const adapter = zod(updateProjectSchema);

export const load: PageServerLoad = async ({ parent }) => {
	const { project: proj } = await parent();
	const form = await superValidate(
		{ name: proj.name, description: proj.description ?? '' },
		adapter
	);

	return { form };
};

export const actions: Actions = {
	update: async ({ request, locals, params }) => {
		const user = requireAuth(locals);
		const projectId = Number(params.projectId);
		await requireProjectRole(user, projectId, ['PROJECT_ADMIN']);

		const form = await superValidate(request, adapter);

		if (!form.valid) {
			return fail(400, { form });
		}

		const { name, description } = form.data as UpdateProjectInput;
		await db
			.update(project)
			.set({
				name,
				description: description || null
			})
			.where(eq(project.id, projectId));

		return message(form, 'Project updated successfully');
	},

	deactivate: async ({ locals, params }) => {
		const user = requireAuth(locals);
		const projectId = Number(params.projectId);
		await requireProjectRole(user, projectId, ['PROJECT_ADMIN']);

		await db.update(project).set({ active: false }).where(eq(project.id, projectId));

		redirect(303, '/projects');
	}
};
