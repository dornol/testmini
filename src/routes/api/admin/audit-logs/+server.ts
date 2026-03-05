import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { auditLog, user } from '$lib/server/db/schema';
import { requireAuth, isGlobalAdmin } from '$lib/server/auth-utils';
import { and, eq, gte, lte, count, desc } from 'drizzle-orm';

export const GET: RequestHandler = async ({ locals, url }) => {
	const authUser = requireAuth(locals);

	if (!isGlobalAdmin(authUser)) {
		return json({ error: 'Admin access required' }, { status: 403 });
	}

	const page = Math.max(1, Number(url.searchParams.get('page') ?? '1'));
	const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') ?? '50')));
	const filterUserId = url.searchParams.get('userId') || null;
	const filterAction = url.searchParams.get('action') || null;
	const filterProjectId = url.searchParams.get('projectId')
		? Number(url.searchParams.get('projectId'))
		: null;
	const from = url.searchParams.get('from') || null;
	const to = url.searchParams.get('to') || null;

	const conditions = [];

	if (filterUserId) {
		conditions.push(eq(auditLog.userId, filterUserId));
	}
	if (filterAction) {
		conditions.push(eq(auditLog.action, filterAction));
	}
	if (filterProjectId && !isNaN(filterProjectId)) {
		conditions.push(eq(auditLog.projectId, filterProjectId));
	}
	if (from) {
		conditions.push(gte(auditLog.createdAt, new Date(from)));
	}
	if (to) {
		// Include the full "to" day
		const toDate = new Date(to);
		toDate.setHours(23, 59, 59, 999);
		conditions.push(lte(auditLog.createdAt, toDate));
	}

	const where = conditions.length > 0 ? and(...conditions) : undefined;

	const [logs, totalResult] = await Promise.all([
		db
			.select({
				id: auditLog.id,
				action: auditLog.action,
				entityType: auditLog.entityType,
				entityId: auditLog.entityId,
				projectId: auditLog.projectId,
				metadata: auditLog.metadata,
				ipAddress: auditLog.ipAddress,
				createdAt: auditLog.createdAt,
				userId: auditLog.userId,
				userName: user.name,
				userEmail: user.email
			})
			.from(auditLog)
			.leftJoin(user, eq(auditLog.userId, user.id))
			.where(where)
			.orderBy(desc(auditLog.createdAt))
			.limit(limit)
			.offset((page - 1) * limit),
		db.select({ total: count() }).from(auditLog).where(where)
	]);

	const total = totalResult[0]?.total ?? 0;

	return json({
		data: logs,
		meta: {
			page,
			limit,
			total,
			totalPages: Math.ceil(total / limit)
		}
	});
};
