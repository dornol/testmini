import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { auditLog, user } from '$lib/server/db/schema';
import { and, eq, gte, lte, count, desc } from 'drizzle-orm';

const LIMIT = 50;

export const load: PageServerLoad = async ({ url }) => {
	const page = Math.max(1, Number(url.searchParams.get('page') ?? '1'));
	const filterUserId = url.searchParams.get('userId') || '';
	const filterAction = url.searchParams.get('action') || '';
	const filterProjectId = url.searchParams.get('projectId')
		? Number(url.searchParams.get('projectId'))
		: null;
	const from = url.searchParams.get('from') || '';
	const to = url.searchParams.get('to') || '';

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
			.limit(LIMIT)
			.offset((page - 1) * LIMIT),
		db.select({ total: count() }).from(auditLog).where(where)
	]);

	const total = totalResult[0]?.total ?? 0;

	// Collect distinct actions for the filter dropdown
	const distinctActions = await db
		.selectDistinct({ action: auditLog.action })
		.from(auditLog)
		.orderBy(auditLog.action);

	return {
		logs,
		actions: distinctActions.map((r) => r.action),
		filters: {
			userId: filterUserId,
			action: filterAction,
			projectId: filterProjectId ? String(filterProjectId) : '',
			from,
			to
		},
		pagination: {
			page,
			limit: LIMIT,
			total,
			totalPages: Math.ceil(total / LIMIT)
		}
	};
};
