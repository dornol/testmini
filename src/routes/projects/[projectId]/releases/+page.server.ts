import type { PageServerLoad } from './$types';
import { db, col } from '$lib/server/db';
import { release, user } from '$lib/server/db/schema';
import { eq, sql } from 'drizzle-orm';

export const load: PageServerLoad = async ({ params, parent }) => {
	await parent();
	const projectId = Number(params.projectId);

	const releases = await db
		.select({
			id: release.id,
			name: release.name,
			version: release.version,
			description: release.description,
			status: release.status,
			targetDate: release.targetDate,
			releaseDate: release.releaseDate,
			createdBy: user.name,
			createdAt: release.createdAt,
			planCount: sql<number>`(select count(*)::int from test_plan where release_id = ${col(release.id)})`.as('plan_count'),
			runCount: sql<number>`(select count(*)::int from test_run where release_id = ${col(release.id)})`.as('run_count')
		})
		.from(release)
		.innerJoin(user, eq(release.createdBy, user.id))
		.where(eq(release.projectId, projectId))
		.orderBy(release.createdAt);

	return { releases };
};
