import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { notification } from '$lib/server/db/schema';
import { withAuth } from '$lib/server/api-handler';
import { and, eq, lt, desc } from 'drizzle-orm';
import { badRequest } from '$lib/server/errors';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function parseLimit(value: string | null): number {
	if (value === null || value === '') return DEFAULT_LIMIT;

	const parsed = Number(value);
	if (!Number.isSafeInteger(parsed) || parsed <= 0) {
		throw new Error('Invalid limit');
	}

	return Math.min(parsed, MAX_LIMIT);
}

function parseCursor(value: string | null): number | null {
	if (value === null || value === '') return null;

	const parsed = Number(value);
	if (!Number.isSafeInteger(parsed) || parsed <= 0) {
		throw new Error('Invalid cursor');
	}

	return parsed;
}

export const GET = withAuth(async ({ user, url }) => {
	const unreadOnly = url.searchParams.get('unreadOnly') === 'true';
	let limit: number;
	let cursorId: number | null;

	try {
		limit = parseLimit(url.searchParams.get('limit'));
		cursorId = parseCursor(url.searchParams.get('cursor'));
	} catch (err) {
		return badRequest(err instanceof Error ? err.message : 'Invalid pagination parameters');
	}

	const conditions = [eq(notification.userId, user.id)];

	if (unreadOnly) {
		conditions.push(eq(notification.isRead, false));
	}

	// Cursor-based pagination: cursor is the id of the last item from the previous page
	if (cursorId !== null) {
		conditions.push(lt(notification.id, cursorId));
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
