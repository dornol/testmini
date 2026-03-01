import type { LayoutServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { requireAuth, isGlobalAdmin } from '$lib/server/auth-utils';

export const load: LayoutServerLoad = async ({ locals }) => {
	const user = requireAuth(locals);

	if (!isGlobalAdmin(user)) {
		error(403, 'Admin access required');
	}
};
