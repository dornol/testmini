import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { notification } from '$lib/server/db/schema';
import { withAuth } from '$lib/server/api-handler';
import { and, eq, inArray } from 'drizzle-orm';

export const POST = withAuth(async ({ user, request }) => {

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		error(400, 'Invalid JSON body');
	}

	if (typeof body !== 'object' || body === null) {
		error(400, 'Invalid request body');
	}

	const payload = body as Record<string, unknown>;

	if (payload.all === true) {
		// Mark all unread notifications as read for this user
		await db
			.update(notification)
			.set({ isRead: true })
			.where(and(eq(notification.userId, user.id), eq(notification.isRead, false)));

		return json({ ok: true });
	}

	if (Array.isArray(payload.ids) && payload.ids.length > 0) {
		const ids = payload.ids as number[];

		if (!ids.every((id) => typeof id === 'number' && Number.isInteger(id))) {
			error(400, 'ids must be an array of integers');
		}

		// Only allow marking notifications that belong to the current user
		await db
			.update(notification)
			.set({ isRead: true })
			.where(and(eq(notification.userId, user.id), inArray(notification.id, ids)));

		return json({ ok: true });
	}

	error(400, 'Provide either { all: true } or { ids: number[] }');
});
