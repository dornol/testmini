import type { PageServerLoad, Actions } from './$types';
import { error, fail, redirect } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { createProjectSchema, type CreateProjectInput } from '$lib/schemas/project.schema';
import { childLogger } from '$lib/server/logger';
import { zodAdapter } from '$lib/server/form-utils';
import { db } from '$lib/server/db';
import { project } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { requireAuth, requireProjectRole, parseId } from '$lib/server/auth-utils';

const log = childLogger('project-settings');
const adapter = zodAdapter(createProjectSchema);

export const load: PageServerLoad = async ({ parent, params }) => {
	const { project: proj } = await parent();
	const form = await superValidate(
		{ name: proj.name, description: proj.description ?? '' },
		adapter
	);

	const projectId = parseId(params.projectId, 'project ID');
	const [projSettings] = await db
		.select({ requireSignoff: project.requireSignoff })
		.from(project)
		.where(eq(project.id, projectId));

	return { form, requireSignoff: projSettings?.requireSignoff ?? false };
};

export const actions: Actions = {
	update: async ({ request, locals, params }) => {
		const user = requireAuth(locals);
		const projectId = parseId(params.projectId, 'project ID');
		await requireProjectRole(user, projectId, ['PROJECT_ADMIN']);

		const form = await superValidate(request, adapter);

		if (!form.valid) {
			return fail(400, { form });
		}

		const { name, description } = form.data as CreateProjectInput;
		const changes = await db
			.update(project)
			.set({
				name,
				description: description || null
			})
			.where(eq(project.id, projectId))
			.returning()
			.catch(() => {
				log.error({ requestId: locals.requestId }, 'Project settings update failed');
				return null;
			});

		if (!changes) return message(form, 'save_failed', { status: 500 });
		const [updated] = changes;
		if (!updated) {
			error(404, 'Project not found');
		}

		return message(form, 'Project updated successfully');
	},

	toggleSignoff: async ({ locals, params }) => {
		const user = requireAuth(locals);
		const projectId = parseId(params.projectId, 'project ID');
		await requireProjectRole(user, projectId, ['PROJECT_ADMIN']);

		const [proj] = await db
			.select({ requireSignoff: project.requireSignoff })
			.from(project)
			.where(eq(project.id, projectId));

		if (!proj) {
			error(404, 'Project not found');
		}

		const [updated] = await db
			.update(project)
			.set({ requireSignoff: !proj.requireSignoff })
			.where(eq(project.id, projectId))
			.returning();

		if (!updated) {
			error(404, 'Project not found');
		}

		return { success: true, requireSignoff: !proj.requireSignoff };
	},

	deactivate: async ({ locals, params }) => {
		const user = requireAuth(locals);
		const projectId = parseId(params.projectId, 'project ID');
		await requireProjectRole(user, projectId, ['PROJECT_ADMIN']);

		const [deactivated] = await db
			.update(project)
			.set({ active: false })
			.where(eq(project.id, projectId))
			.returning();

		if (!deactivated) {
			error(404, 'Project not found');
		}

		redirect(303, '/projects');
	}
};
