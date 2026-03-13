import type { PageServerLoad } from './$types';
import { db, col } from '$lib/server/db';
import { testPlan, user } from '$lib/server/db/schema';
import { eq, sql } from 'drizzle-orm';

export const load: PageServerLoad = async ({ params, parent }) => {
	await parent();
	const projectId = Number(params.projectId);

	const plans = await db
		.select({
			id: testPlan.id,
			name: testPlan.name,
			description: testPlan.description,
			status: testPlan.status,
			milestone: testPlan.milestone,
			startDate: testPlan.startDate,
			endDate: testPlan.endDate,
			createdBy: user.name,
			createdAt: testPlan.createdAt,
			itemCount: sql<number>`(select count(*)::int from test_plan_test_case where test_plan_id = ${col(testPlan.id)})`.as('item_count'),
			runCount: sql<number>`(select count(*)::int from test_run where test_plan_id = ${col(testPlan.id)})`.as('run_count')
		})
		.from(testPlan)
		.innerJoin(user, eq(testPlan.createdBy, user.id))
		.where(eq(testPlan.projectId, projectId))
		.orderBy(testPlan.createdAt);

	return { plans };
};
