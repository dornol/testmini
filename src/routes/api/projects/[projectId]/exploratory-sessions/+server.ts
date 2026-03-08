import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { exploratorySession, sessionNote, user } from '$lib/server/db/schema';
import { eq, and, desc, count, sql } from 'drizzle-orm';
import { withProjectAccess, withProjectRole } from '$lib/server/api-handler';
import { badRequest } from '$lib/server/errors';

export const GET = withProjectAccess(async ({ projectId, url }) => {
	const status = url.searchParams.get('status') ?? '';
	const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') ?? '20')));
	const offset = Math.max(0, Number(url.searchParams.get('offset') ?? '0'));

	const conditions = [eq(exploratorySession.projectId, projectId)];
	if (status && ['ACTIVE', 'PAUSED', 'COMPLETED'].includes(status)) {
		conditions.push(eq(exploratorySession.status, status));
	}

	const where = and(...conditions);

	const [sessions, totalResult] = await Promise.all([
		db
			.select({
				id: exploratorySession.id,
				title: exploratorySession.title,
				charter: exploratorySession.charter,
				status: exploratorySession.status,
				startedAt: exploratorySession.startedAt,
				pausedDuration: exploratorySession.pausedDuration,
				completedAt: exploratorySession.completedAt,
				environment: exploratorySession.environment,
				tags: exploratorySession.tags,
				createdBy: user.name,
				createdById: exploratorySession.createdBy,
				noteCount: sql<number>`(select count(*) from session_note where session_id = ${exploratorySession.id})`.as('note_count')
			})
			.from(exploratorySession)
			.innerJoin(user, eq(exploratorySession.createdBy, user.id))
			.where(where)
			.orderBy(desc(exploratorySession.startedAt))
			.limit(limit)
			.offset(offset),
		db.select({ total: count() }).from(exploratorySession).where(where)
	]);

	return json({
		sessions,
		total: totalResult[0]?.total ?? 0
	});
});

export const POST = withProjectRole(
	['PROJECT_ADMIN', 'QA', 'DEV'],
	async ({ request, user: authUser, projectId }) => {
		let body: { title?: string; charter?: string; environment?: string; tags?: string[] };
		try {
			body = await request.json();
		} catch {
			error(400, 'Invalid JSON');
		}

		const title = (body.title ?? '').trim();
		if (!title) return badRequest('Title is required');
		if (title.length > 500) return badRequest('Title must be 500 characters or less');

		const [created] = await db
			.insert(exploratorySession)
			.values({
				projectId,
				title,
				charter: body.charter?.trim() || null,
				environment: body.environment?.trim() || null,
				tags: body.tags ?? [],
				createdBy: authUser.id
			})
			.returning();

		return json(created, { status: 201 });
	}
);
