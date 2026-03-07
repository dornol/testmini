import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { notification } from '$lib/server/db/schema';
import { withAuth } from '$lib/server/api-handler';
import { and, eq, lt, desc } from 'drizzle-orm';

export const GET = withAuth(async ({ user, url }) => {

	const unreadOnly = url.searchParams.get('unreadOnly') === 'true';
	const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? '20')));
	const cursor = url.searchParams.get('cursor');

	const conditions = [eq(notification.userId, user.id)];

	if (unreadOnly) {
		conditions.push(eq(notification.isRead, false));
	}

	// Cursor-based pagination: cursor is the id of the last item from the previous page
	if (cursor) {
		const cursorId = Number(cursor);
		if (!isNaN(cursorId)) {
			conditions.push(lt(notification.id, cursorId));
		}
	}

	const rows = await db
		.select()
		.from(notification)
		.where(and(...conditions))
		.orderBy(desc(notification.createdAt), desc(notification.id))
		.limit(limit + 1);

	const hasMore = rows.length > limit;
	const items = hasMore ? rows.slice(0, limit) : rows;
	const nextCursor = hasMore ? String(items[items.length - 1].id) : null;

	return json({ items, nextCursor, hasMore });
});
