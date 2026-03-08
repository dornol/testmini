import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { exploratorySession, user } from '$lib/server/db/schema';
import { eq, and, desc, count, sql } from 'drizzle-orm';

export const load: PageServerLoad = async ({ params, url, parent }) => {
	await parent();
	const projectId = Number(params.projectId);

	const statusFilter = url.searchParams.get('status') ?? '';

	const conditions = [eq(exploratorySession.projectId, projectId)];
	if (statusFilter && ['ACTIVE', 'PAUSED', 'COMPLETED'].includes(statusFilter)) {
		conditions.push(eq(exploratorySession.status, statusFilter));
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
				noteCount: sql<number>`(select count(*) from session_note where session_id = ${exploratorySession.id})`.as('note_count')
			})
			.from(exploratorySession)
			.innerJoin(user, eq(exploratorySession.createdBy, user.id))
			.where(where)
			.orderBy(desc(exploratorySession.startedAt)),
		db.select({ total: count() }).from(exploratorySession).where(where)
	]);

	return {
		sessions,
		total: totalResult[0]?.total ?? 0,
		statusFilter
	};
};
