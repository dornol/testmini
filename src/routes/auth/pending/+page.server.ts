import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { user } from '$lib/server/db/auth.schema';
import { eq } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		redirect(302, '/auth/login');
	}

	const [dbUser] = await db
		.select({ approved: user.approved })
		.from(user)
		.where(eq(user.id, locals.user.id));

	if (dbUser?.approved) {
		redirect(302, '/projects');
	}

	return {
		userName: locals.user.name,
		userEmail: locals.user.email
	};
};
