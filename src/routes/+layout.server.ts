import type { LayoutServerLoad } from './$types';
import { db } from '$lib/server/db';
import { userPreference } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const load: LayoutServerLoad = async ({ locals }) => {
	let preferences: { locale: string | null; theme: string | null } | null = null;

	if (locals.user) {
		try {
			const pref = await db.query.userPreference.findFirst({
				where: eq(userPreference.userId, locals.user.id)
			});
			if (pref) {
				preferences = { locale: pref.locale, theme: pref.theme };
			}
		} catch {
			// table may not exist yet if migration hasn't been run
		}
	}

	return {
		user: locals.user ?? null,
		session: locals.session ?? null,
		preferences
	};
};
