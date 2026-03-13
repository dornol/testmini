import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { db, col } from '$lib/server/db';
import { release, testPlan, testRun, user } from '$lib/server/db/schema';
import { eq, and, sql } from 'drizzle-orm';

export const load: PageServerLoad = async ({ params, parent }) => {
	await parent();
	const projectId = Number(params.projectId);
	const releaseId = Number(params.releaseId);

	const rel = await db.query.release.findFirst({
		where: and(eq(release.id, releaseId), eq(release.projectId, projectId))
	});
	if (!rel) error(404, 'Release not found');

	const [[creator], plans, runs, availablePlans, availableRuns] = await Promise.all([
		db.select({ name: user.name }).from(user).where(eq(user.id, rel.createdBy)),
		db.select({
			id: testPlan.id,
			name: testPlan.name,
			status: testPlan.status,
			milestone: testPlan.milestone
		}).from(testPlan).where(eq(testPlan.releaseId, releaseId)),
		db.select({
			id: testRun.id,
			name: testRun.name,
			status: testRun.status,
			environment: testRun.environment,
			createdAt: testRun.createdAt,
			total: sql<number>`(select count(*)::int from test_execution where test_run_id = ${col(testRun.id)})`.as('total'),
			pass: sql<number>`(select count(*)::int from test_execution where test_run_id = ${col(testRun.id)} and status = 'PASS')`.as('pass'),
			fail: sql<number>`(select count(*)::int from test_execution where test_run_id = ${col(testRun.id)} and status = 'FAIL')`.as('fail'),
			blocked: sql<number>`(select count(*)::int from test_execution where test_run_id = ${col(testRun.id)} and status = 'BLOCKED')`.as('blocked'),
			pending: sql<number>`(select count(*)::int from test_execution where test_run_id = ${col(testRun.id)} and status = 'PENDING')`.as('pending')
		}).from(testRun).where(eq(testRun.releaseId, releaseId)).orderBy(testRun.createdAt),
		db.select({ id: testPlan.id, name: testPlan.name, status: testPlan.status })
			.from(testPlan)
			.where(and(eq(testPlan.projectId, projectId), sql`${col(testPlan.releaseId)} IS NULL`)),
		db.select({ id: testRun.id, name: testRun.name, status: testRun.status, environment: testRun.environment })
			.from(testRun)
			.where(and(eq(testRun.projectId, projectId), sql`${col(testRun.releaseId)} IS NULL`))
	]);

	const totalExec = runs.reduce((s, r) => s + Number(r.total), 0);
	const totalPass = runs.reduce((s, r) => s + Number(r.pass), 0);
	const totalFail = runs.reduce((s, r) => s + Number(r.fail), 0);
	const totalBlocked = runs.reduce((s, r) => s + Number(r.blocked), 0);
	const totalPending = runs.reduce((s, r) => s + Number(r.pending), 0);
	const passRate = totalExec > 0 ? Math.round((totalPass / totalExec) * 100) : 0;

	let verdict: 'GO' | 'NO_GO' | 'CAUTION' = 'GO';
	if (totalFail > 0 || totalBlocked > 0) verdict = 'NO_GO';
	else if (totalPending > 0 || runs.length === 0) verdict = 'CAUTION';

	return {
		release: { ...rel, createdByName: creator?.name ?? '' },
		plans,
		runs,
		stats: { total: totalExec, pass: totalPass, fail: totalFail, blocked: totalBlocked, pending: totalPending, passRate },
		verdict,
		availablePlans,
		availableRuns
	};
};
