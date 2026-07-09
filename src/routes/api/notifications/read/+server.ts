import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { notification } from '$lib/server/db/schema';
import { withAuth } from '$lib/server/api-handler';
import { and, eq, inArray } from 'drizzle-orm';
import { cacheDelete } from '$lib/server/cache';
import { parseJsonBody } from '$lib/server/auth-utils';
import { z } from 'zod';

const MAX_NOTIFICATION_IDS = 100;

const notificationIdSchema = z
	.number()
	.int()
	.positive()
	.refine(Number.isSafeInteger, 'ids must be positive safe integers');

const markNotificationsReadSchema = z.union([
	z.object({ all: z.literal(true) }).strict(),
	z
		.object({
			ids: z
				.array(notificationIdSchema)
				.min(1)
				.max(MAX_NOTIFICATION_IDS, `ids must contain ${MAX_NOTIFICATION_IDS} items or fewer`)
		})
		.strict()
]);

export const POST = withAuth(async ({ user, request }) => {
	let body: unknown;
	try {
		body = await parseJsonBody(request);
	} catch {
		error(400, 'Invalid JSON body');
	}

	const parsed = markNotificationsReadSchema.safeParse(body);
	if (!parsed.success) {
		error(400, 'Provide either { all: true } or { ids: number[] }');
	}

	if ('all' in parsed.data) {
		// Mark all unread notifications as read for this user
		const updated = await db
			.update(notification)
			.set({ isRead: true })
			.where(and(eq(notification.userId, user.id), eq(notification.isRead, false)))
			.returning({ id: notification.id });

		cacheDelete(`user:${user.id}:unread_notifications`);
		return json({ ok: true, updated: updated.length });
	}

	const ids = parsed.data.ids;
	if (new Set(ids).size !== ids.length) {
		error(400, 'Notification IDs must be unique');
	}

	// Only allow marking notifications that belong to the current user
	const updated = await db
		.update(notification)
		.set({ isRead: true })
		.where(and(eq(notification.userId, user.id), inArray(notification.id, ids)))
		.returning({ id: notification.id });
	if (updated.length !== ids.length) {
		error(404, 'Notification not found');
	}

	cacheDelete(`user:${user.id}:unread_notifications`);
	return json({ ok: true, updated: updated.length });
});
