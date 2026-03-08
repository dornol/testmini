import type { PageServerLoad, Actions } from './$types';
import { redirect, fail } from '@sveltejs/kit';
import { superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import { createProjectSchema, type CreateProjectInput } from '$lib/schemas/project.schema';
import { db } from '$lib/server/db';
import { project, projectMember, priorityConfig, environmentConfig } from '$lib/server/db/schema';

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

			// Seed default priorities
			await tx.insert(priorityConfig).values([
				{ projectId: created.id, name: 'LOW', color: '#6b7280', position: 0, isDefault: false, createdBy: locals.user!.id },
				{ projectId: created.id, name: 'MEDIUM', color: '#3b82f6', position: 1, isDefault: true, createdBy: locals.user!.id },
				{ projectId: created.id, name: 'HIGH', color: '#f97316', position: 2, isDefault: false, createdBy: locals.user!.id },
				{ projectId: created.id, name: 'CRITICAL', color: '#ef4444', position: 3, isDefault: false, createdBy: locals.user!.id }
			]);

			// Seed default environments
			await tx.insert(environmentConfig).values([
				{ projectId: created.id, name: 'DEV', color: '#3b82f6', position: 0, isDefault: true, createdBy: locals.user!.id },
				{ projectId: created.id, name: 'QA', color: '#8b5cf6', position: 1, isDefault: false, createdBy: locals.user!.id },
				{ projectId: created.id, name: 'STAGE', color: '#f97316', position: 2, isDefault: false, createdBy: locals.user!.id },
				{ projectId: created.id, name: 'PROD', color: '#ef4444', position: 3, isDefault: false, createdBy: locals.user!.id }
			]);

			return created;
		});

		redirect(303, `/projects/${newProject.id}`);
	}
};
