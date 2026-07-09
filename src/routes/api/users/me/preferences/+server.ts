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
const PREFERENCE_KEYS = new Set(['locale', 'theme', 'notificationSettings']);
const NOTIFICATION_SETTINGS_KEYS = new Set(['enableInApp', 'mutedTypes']);
const MAX_MUTED_TYPES = 100;
const MAX_MUTED_TYPE_LENGTH = 100;

function validatePreferenceBody(body: unknown): Record<string, unknown> {
	if (!body || typeof body !== 'object' || Array.isArray(body)) {
		error(400, 'Invalid request body');
	}
	const raw = body as Record<string, unknown>;
	const keys = Object.keys(raw);
	if (keys.length === 0) {
		error(400, 'No preferences to update');
	}
	if (keys.some((key) => !PREFERENCE_KEYS.has(key))) {
		error(400, 'Invalid preference field');
	}
	return raw;
}

function validateNotificationSettings(
	value: unknown
): { enableInApp?: boolean; mutedTypes?: string[] } | null | undefined {
	if (value === undefined || value === null) return value;
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		error(400, 'Invalid notificationSettings');
	}

	const settings = value as Record<string, unknown>;
	if (Object.keys(settings).some((key) => !NOTIFICATION_SETTINGS_KEYS.has(key))) {
		error(400, 'Invalid notificationSettings field');
	}

	const parsed: { enableInApp?: boolean; mutedTypes?: string[] } = {};

	if (settings.enableInApp !== undefined) {
		if (typeof settings.enableInApp !== 'boolean') {
			error(400, 'enableInApp must be a boolean');
		}
		parsed.enableInApp = settings.enableInApp;
	}

	if (settings.mutedTypes !== undefined) {
		if (!Array.isArray(settings.mutedTypes)) {
			error(400, 'mutedTypes must be an array of strings');
		}
		if (settings.mutedTypes.length > MAX_MUTED_TYPES) {
			error(400, `mutedTypes must contain ${MAX_MUTED_TYPES} items or fewer`);
		}
		const mutedTypes = settings.mutedTypes.map((item) =>
			typeof item === 'string' ? item.trim() : ''
		);
		if (
			mutedTypes.some((item) => !item || item.length > MAX_MUTED_TYPE_LENGTH) ||
			new Set(mutedTypes).size !== mutedTypes.length
		) {
			error(400, 'mutedTypes must be unique non-empty strings');
		}
		parsed.mutedTypes = mutedTypes;
	}

	return parsed;
}

export const PUT = withAuth(async ({ request, user }) => {
	let body: unknown;
	try {
		body = await parseJsonBody(request);
	} catch (e) {
		if (e && typeof e === 'object' && 'status' in e) throw e;
		error(400, 'Invalid JSON');
	}

	const raw = validatePreferenceBody(body);
	const locale = raw.locale;
	const theme = raw.theme;
	const notificationSettings = validateNotificationSettings(raw.notificationSettings);

	if (
		locale !== undefined &&
		locale !== null &&
		(typeof locale !== 'string' || !VALID_LOCALES.includes(locale))
	) {
		error(400, 'Invalid locale');
	}
	if (
		theme !== undefined &&
		theme !== null &&
		(typeof theme !== 'string' || !VALID_THEMES.includes(theme))
	) {
		error(400, 'Invalid theme');
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
