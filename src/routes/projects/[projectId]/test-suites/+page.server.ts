import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { testSuite, user } from '$lib/server/db/schema';
import { eq, sql } from 'drizzle-orm';

export const load: PageServerLoad = async ({ params, parent }) => {
	await parent();
	const projectId = Number(params.projectId);

	const suites = await db
		.select({
			id: testSuite.id,
			name: testSuite.name,
			description: testSuite.description,
			createdBy: user.name,
			createdAt: testSuite.createdAt,
			itemCount: sql<number>`(select count(*) from test_suite_item where suite_id = ${testSuite.id})`.as('item_count')
		})
		.from(testSuite)
		.innerJoin(user, eq(testSuite.createdBy, user.id))
		.where(eq(testSuite.projectId, projectId))
		.orderBy(testSuite.name);

	return { suites };
};
