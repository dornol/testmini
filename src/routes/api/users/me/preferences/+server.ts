import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { userPreference } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { withAuth } from '$lib/server/api-handler';

export const GET = withAuth(async ({ user }) => {
	const pref = await db.query.userPreference.findFirst({
		where: eq(userPreference.userId, user.id)
	});

	return json(pref ?? { userId: user.id, locale: null, theme: null });
});

const VALID_LOCALES = ['ko', 'en'];
const VALID_THEMES = ['light', 'dark', 'system'];

export const PUT = withAuth(async ({ request, user }) => {

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		error(400, 'Invalid JSON');
	}

	const { locale, theme } = body as { locale?: string; theme?: string };

	if (locale !== undefined && locale !== null && !VALID_LOCALES.includes(locale)) {
		error(400, 'Invalid locale');
	}
	if (theme !== undefined && theme !== null && !VALID_THEMES.includes(theme)) {
		error(400, 'Invalid theme');
	}

	const values: { userId: string; locale?: string | null; theme?: string | null; updatedAt: Date } = {
		userId: user.id,
		updatedAt: new Date()
	};
	if (locale !== undefined) values.locale = locale;
	if (theme !== undefined) values.theme = theme;

	await db
		.insert(userPreference)
		.values(values)
		.onConflictDoUpdate({
			target: userPreference.userId,
			set: {
				...(locale !== undefined && { locale }),
				...(theme !== undefined && { theme }),
				updatedAt: new Date()
			}
		});

	const updated = await db.query.userPreference.findFirst({
		where: eq(userPreference.userId, user.id)
	});

	return json(updated);
});
