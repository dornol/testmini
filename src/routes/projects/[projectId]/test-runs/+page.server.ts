import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { testRun, testExecution, user } from '$lib/server/db/schema';
import { eq, count, and, sql, desc } from 'drizzle-orm';

export const load: PageServerLoad = async ({ params, url, parent }) => {
	await parent();
	const projectId = Number(params.projectId);

	const page = Math.max(1, Number(url.searchParams.get('page') ?? '1'));
	const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') ?? '20')));
	const offset = (page - 1) * limit;
	const statusFilter = url.searchParams.get('status') ?? '';

	const conditions = [eq(testRun.projectId, projectId)];
	if (statusFilter && ['CREATED', 'IN_PROGRESS', 'COMPLETED'].includes(statusFilter)) {
		conditions.push(
			eq(testRun.status, statusFilter as 'CREATED' | 'IN_PROGRESS' | 'COMPLETED')
		);
	}

	const where = and(...conditions);

	const [runs, totalResult] = await Promise.all([
		db
			.select({
				id: testRun.id,
				name: testRun.name,
				environment: testRun.environment,
				status: testRun.status,
				createdBy: user.name,
				createdAt: testRun.createdAt,
				startedAt: testRun.startedAt,
				finishedAt: testRun.finishedAt,
				totalCount: sql<number>`(select count(*) from test_execution where test_run_id = ${testRun.id})`.as('total_count'),
				passedCount: sql<number>`(select count(*) from test_execution where test_run_id = ${testRun.id} and status = 'PASS')`.as('passed_count')
			})
			.from(testRun)
			.innerJoin(user, eq(testRun.createdBy, user.id))
			.where(where)
			.orderBy(desc(testRun.createdAt))
			.limit(limit)
			.offset(offset),
		db.select({ total: count() }).from(testRun).where(where)
	]);

	const total = totalResult[0]?.total ?? 0;

	return {
		runs,
		meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
		statusFilter
	};
};
