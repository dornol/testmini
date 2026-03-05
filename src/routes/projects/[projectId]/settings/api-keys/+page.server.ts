import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { requireAuth, requireProjectRole } from '$lib/server/auth-utils';

export const load: PageServerLoad = async ({ parent, locals, params }) => {
	const authUser = requireAuth(locals);
	const projectId = Number(params.projectId);

	const { userRole } = await parent();

	// Only PROJECT_ADMIN can manage API keys
	if (userRole !== 'PROJECT_ADMIN' && userRole !== 'ADMIN') {
		redirect(303, `/projects/${projectId}/settings`);
	}

	return {};
};
