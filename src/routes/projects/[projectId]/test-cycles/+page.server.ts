import type { PageServerLoad } from './$types';
import { db, col } from '$lib/server/db';
import { release, testCycle, user } from '$lib/server/db/schema';
import { eq, sql } from 'drizzle-orm';
import { parseId } from '$lib/server/auth-utils';

export const load: PageServerLoad = async ({ params, parent }) => {
	await parent();
	const projectId = parseId(params.projectId, 'project ID');

	const [cycles, releases] = await Promise.all([
		db
			.select({
				id: testCycle.id,
				name: testCycle.name,
				cycleNumber: testCycle.cycleNumber,
				status: testCycle.status,
				releaseId: testCycle.releaseId,
				releaseName: release.name,
				releaseVersion: release.version,
				startDate: testCycle.startDate,
				endDate: testCycle.endDate,
				createdBy: user.name,
				createdAt: testCycle.createdAt,
				runCount:
					sql<number>`(select count(*)::int from test_run where test_cycle_id = ${col(testCycle.id)})`.as(
						'run_count'
					)
			})
			.from(testCycle)
			.innerJoin(user, eq(testCycle.createdBy, user.id))
			.leftJoin(release, eq(testCycle.releaseId, release.id))
			.where(eq(testCycle.projectId, projectId))
			.orderBy(testCycle.cycleNumber),
		db
			.select({ id: release.id, name: release.name, version: release.version })
			.from(release)
			.where(eq(release.projectId, projectId))
			.orderBy(release.createdAt)
	]);

	return {
		cycles,
		releases,
		nextCycleNumber: Math.max(0, ...cycles.map((cycle) => cycle.cycleNumber)) + 1
	};
};
