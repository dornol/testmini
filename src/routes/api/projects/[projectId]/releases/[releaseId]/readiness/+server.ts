import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { release, testRun, testExecution, testCaseVersion, testCase } from '$lib/server/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { withProjectAccess } from '$lib/server/api-handler';
import { notFound } from '$lib/server/errors';

export const GET = withProjectAccess(async ({ params, projectId }) => {
	const releaseId = Number(params.releaseId);
	if (!Number.isFinite(releaseId)) error(400, 'Invalid release ID');

	const rel = await db.query.release.findFirst({
		where: and(eq(release.id, releaseId), eq(release.projectId, projectId))
	});
	if (!rel) return notFound('Release not found');

	// Get all linked runs with execution stats
	const runs = await db
		.select({
			id: testRun.id,
			name: testRun.name,
			status: testRun.status,
			total: sql<number>`(select count(*) from test_execution where test_run_id = ${testRun.id})`.as('total'),
			pass: sql<number>`(select count(*) from test_execution where test_run_id = ${testRun.id} and status = 'PASS')`.as('pass'),
			fail: sql<number>`(select count(*) from test_execution where test_run_id = ${testRun.id} and status = 'FAIL')`.as('fail'),
			blocked: sql<number>`(select count(*) from test_execution where test_run_id = ${testRun.id} and status = 'BLOCKED')`.as('blocked'),
			pending: sql<number>`(select count(*) from test_execution where test_run_id = ${testRun.id} and status = 'PENDING')`.as('pending')
		})
		.from(testRun)
		.where(eq(testRun.releaseId, releaseId));

	const totalExec = runs.reduce((s, r) => s + Number(r.total), 0);
	const totalPass = runs.reduce((s, r) => s + Number(r.pass), 0);
	const totalFail = runs.reduce((s, r) => s + Number(r.fail), 0);
	const totalBlocked = runs.reduce((s, r) => s + Number(r.blocked), 0);
	const totalPending = runs.reduce((s, r) => s + Number(r.pending), 0);

	// Blocking failures: runs that have FAIL or BLOCKED and are not COMPLETED
	const blockingRuns = runs.filter(r => (Number(r.fail) > 0 || Number(r.blocked) > 0));

	// Verdict
	let verdict: 'GO' | 'NO_GO' | 'CAUTION' = 'GO';
	if (totalFail > 0 || totalBlocked > 0) {
		verdict = 'NO_GO';
	} else if (totalPending > 0 || runs.length === 0) {
		verdict = 'CAUTION';
	}

	const passRate = totalExec > 0 ? Math.round((totalPass / totalExec) * 100) : 0;

	return json({
		verdict,
		stats: { total: totalExec, pass: totalPass, fail: totalFail, blocked: totalBlocked, pending: totalPending, passRate },
		runCount: runs.length,
		blockingRuns: blockingRuns.map(r => ({ id: r.id, name: r.name, fail: Number(r.fail), blocked: Number(r.blocked) }))
	});
});
