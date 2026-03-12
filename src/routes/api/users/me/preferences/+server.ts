import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { userPreference } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { withAuth } from '$lib/server/api-handler';
import { parseJsonBody } from '$lib/server/auth-utils';

export const GET = withAuth(async ({ user }) => {
	const pref = await db.query.userPreference.findFirst({
		where: eq(userPreference.userId, user.id)
	});

	return json(pref ?? { userId: user.id, locale: null, theme: null, notificationSettings: null });
});

const VALID_LOCALES = ['ko', 'en'];
const VALID_THEMES = ['light', 'dark', 'system'];

export const PUT = withAuth(async ({ request, user }) => {

	let body: unknown;
	try {
		body = await parseJsonBody(request);
	} catch {
		error(400, 'Invalid JSON');
	}

	const { locale, theme, notificationSettings } = body as {
		locale?: string;
		theme?: string;
		notificationSettings?: { enableInApp?: boolean; mutedTypes?: string[] } | null;
	};

	if (locale !== undefined && locale !== null && !VALID_LOCALES.includes(locale)) {
		error(400, 'Invalid locale');
	}
	if (theme !== undefined && theme !== null && !VALID_THEMES.includes(theme)) {
		error(400, 'Invalid theme');
	}
	if (notificationSettings !== undefined && notificationSettings !== null) {
		if (typeof notificationSettings !== 'object') {
			error(400, 'Invalid notificationSettings');
		}
		if (notificationSettings.enableInApp !== undefined && typeof notificationSettings.enableInApp !== 'boolean') {
			error(400, 'enableInApp must be a boolean');
		}
		if (notificationSettings.mutedTypes !== undefined) {
			if (!Array.isArray(notificationSettings.mutedTypes) || !notificationSettings.mutedTypes.every((t) => typeof t === 'string')) {
				error(400, 'mutedTypes must be an array of strings');
			}
		}
	}

	const values: {
		userId: string;
		locale?: string | null;
		theme?: string | null;
		notificationSettings?: { enableInApp?: boolean; mutedTypes?: string[] } | null;
		updatedAt: Date;
	} = {
		userId: user.id,
		updatedAt: new Date()
	};
	if (locale !== undefined) values.locale = locale;
	if (theme !== undefined) values.theme = theme;
	if (notificationSettings !== undefined) values.notificationSettings = notificationSettings;

	await db
		.insert(userPreference)
		.values(values)
		.onConflictDoUpdate({
			target: userPreference.userId,
			set: {
				...(locale !== undefined && { locale }),
				...(theme !== undefined && { theme }),
				...(notificationSettings !== undefined && { notificationSettings }),
				updatedAt: new Date()
			}
		});

	const updated = await db.query.userPreference.findFirst({
		where: eq(userPreference.userId, user.id)
	});

	return json(updated);
});
