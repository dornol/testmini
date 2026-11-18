import type { PageServerLoad, Actions } from './$types';
import { error, redirect, fail } from '@sveltejs/kit';
import { message } from 'sveltekit-superforms';
import { childLogger } from '$lib/server/logger';
import { createProjectSchema, type CreateProjectInput } from '$lib/schemas/project.schema';
import { emptyForm, validateForm } from '$lib/server/form-utils';
import { db } from '$lib/server/db';
import { project, projectMember, priorityConfig, environmentConfig } from '$lib/server/db/schema';
import { assertContentLengthUnderLimit } from '$lib/server/request-size';

const log = childLogger('project-create');
const MAX_PROJECT_CREATE_FORM_BODY_SIZE = 16 * 1024;

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		redirect(302, '/auth/login');
	}

	const form = await emptyForm(createProjectSchema);
	return { form };
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		if (!locals.user) {
			redirect(302, '/auth/login');
		}
		assertContentLengthUnderLimit(
			request,
			MAX_PROJECT_CREATE_FORM_BODY_SIZE,
			'Project create form body is too large'
		);

		const form = await validateForm(createProjectSchema, request);

		if (!form.valid) {
			return fail(400, { form });
		}

		const { name, description } = form.data as CreateProjectInput;

		const newProject = await db
			.transaction(async (tx) => {
				const [created] = await tx
					.insert(project)
					.values({
						name,
						description: description || null,
						createdBy: locals.user!.id
					})
					.returning({ id: project.id });

				if (!created) {
					error(500, 'Failed to create project');
				}

				const [member] = await tx
					.insert(projectMember)
					.values({
						projectId: created.id,
						userId: locals.user!.id,
						role: 'PROJECT_ADMIN'
					})
					.returning({ projectId: projectMember.projectId });

				if (!member) {
					error(500, 'Failed to create project owner membership');
				}

				// Seed default priorities
				const priorityValues = [
					{
						projectId: created.id,
						name: 'LOW',
						color: '#6b7280',
						position: 0,
						isDefault: false,
						createdBy: locals.user!.id
					},
					{
						projectId: created.id,
						name: 'MEDIUM',
						color: '#3b82f6',
						position: 1,
						isDefault: true,
						createdBy: locals.user!.id
					},
					{
						projectId: created.id,
						name: 'HIGH',
						color: '#f97316',
						position: 2,
						isDefault: false,
						createdBy: locals.user!.id
					},
					{
						projectId: created.id,
						name: 'CRITICAL',
						color: '#ef4444',
						position: 3,
						isDefault: false,
						createdBy: locals.user!.id
					}
				];
				const insertedPriorities = await tx
					.insert(priorityConfig)
					.values(priorityValues)
					.returning({ id: priorityConfig.id });
				if (insertedPriorities.length !== priorityValues.length) {
					error(500, 'Failed to create default project priorities');
				}

				// Seed default environments
				const environmentValues = [
					{
						projectId: created.id,
						name: 'DEV',
						color: '#3b82f6',
						position: 0,
						isDefault: true,
						createdBy: locals.user!.id
					},
					{
						projectId: created.id,
						name: 'QA',
						color: '#8b5cf6',
						position: 1,
						isDefault: false,
						createdBy: locals.user!.id
					},
					{
						projectId: created.id,
						name: 'STAGE',
						color: '#f97316',
						position: 2,
						isDefault: false,
						createdBy: locals.user!.id
					},
					{
						projectId: created.id,
						name: 'PROD',
						color: '#ef4444',
						position: 3,
						isDefault: false,
						createdBy: locals.user!.id
					}
				];
				const insertedEnvironments = await tx
					.insert(environmentConfig)
					.values(environmentValues)
					.returning({ id: environmentConfig.id });
				if (insertedEnvironments.length !== environmentValues.length) {
					error(500, 'Failed to create default project environments');
				}

				return created;
			})
			.catch(() => {
				log.error({ requestId: locals.requestId }, 'Project creation transaction failed');
				return null;
			});

		if (!newProject) return message(form, 'save_failed', { status: 500 });
		redirect(303, `/projects/${newProject.id}`);
	}
};
