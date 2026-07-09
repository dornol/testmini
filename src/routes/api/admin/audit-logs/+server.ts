import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { badRequest, forbidden } from '$lib/server/errors';
import { db } from '$lib/server/db';
import { auditLog, user } from '$lib/server/db/schema';
import { requireAuth, isGlobalAdmin } from '$lib/server/auth-utils';
import { and, eq, gte, lte, count, desc } from 'drizzle-orm';
import {
	parseOptionalPositiveIntegerSearchParam,
	parsePositiveIntegerSearchParamStrict
} from '$lib/server/search-param-validation';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function parseDateParam(value: string | null, label: string): Date | null {
	if (value === null || value === '') return null;

	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		throw new Error(`Invalid ${label}`);
	}

	return date;
}

export const GET: RequestHandler = async ({ locals, url }) => {
	const authUser = requireAuth(locals);

	if (!isGlobalAdmin(authUser)) {
		return forbidden('Admin access required');
	}

	let page: number;
	let limit: number;
	let filterProjectId: number | null;
	let fromDate: Date | null;
	let toDate: Date | null;

	try {
		page = parsePositiveIntegerSearchParamStrict(url.searchParams.get('page'), 'page', {
			defaultValue: DEFAULT_PAGE
		});
		limit = parsePositiveIntegerSearchParamStrict(url.searchParams.get('limit'), 'limit', {
			defaultValue: DEFAULT_LIMIT,
			max: MAX_LIMIT
		});
		filterProjectId = parseOptionalPositiveIntegerSearchParam(
			url.searchParams.get('projectId'),
			'projectId'
		);
		fromDate = parseDateParam(url.searchParams.get('from'), 'from');
		toDate = parseDateParam(url.searchParams.get('to'), 'to');

		if (fromDate && toDate && fromDate > toDate) {
			return badRequest('from must be before or equal to to');
		}
	} catch (err) {
		return badRequest(err instanceof Error ? err.message : 'Invalid audit log query');
	}

	const filterUserId = url.searchParams.get('userId') || null;
	const filterAction = url.searchParams.get('action') || null;

	const conditions = [];

	if (filterUserId) {
		conditions.push(eq(auditLog.userId, filterUserId));
	}
	if (filterAction) {
		conditions.push(eq(auditLog.action, filterAction));
	}
	if (filterProjectId !== null) {
		conditions.push(eq(auditLog.projectId, filterProjectId));
	}
	if (fromDate) {
		conditions.push(gte(auditLog.createdAt, fromDate));
	}
	if (toDate) {
		// Include the full "to" day
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
