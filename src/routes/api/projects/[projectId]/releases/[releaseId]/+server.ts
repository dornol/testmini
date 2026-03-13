import { json, error } from '@sveltejs/kit';
import { db, col } from '$lib/server/db';
import { release, testPlan, testRun, testExecution, user, testPlanTestCase, testCase, testCaseVersion } from '$lib/server/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { parseJsonBody } from '$lib/server/auth-utils';
import { withProjectAccess, withProjectRole } from '$lib/server/api-handler';
import { updateReleaseSchema } from '$lib/schemas/release.schema';
import { badRequest, notFound, validationError } from '$lib/server/errors';

export const GET = withProjectAccess(async ({ params, projectId }) => {
	const releaseId = Number(params.releaseId);
	if (!Number.isFinite(releaseId)) error(400, 'Invalid release ID');

	const rel = await db.query.release.findFirst({
		where: and(eq(release.id, releaseId), eq(release.projectId, projectId))
	});
	if (!rel) return notFound('Release not found');

	const [creator] = await db
		.select({ name: user.name })
		.from(user)
		.where(eq(user.id, rel.createdBy));

	// Linked plans
	const plans = await db
		.select({
			id: testPlan.id,
			name: testPlan.name,
			status: testPlan.status,
			milestone: testPlan.milestone,
			itemCount: sql<number>`(select count(*)::int from test_plan_test_case where test_plan_id = ${col(testPlan.id)})`.as('item_count')
		})
		.from(testPlan)
		.where(eq(testPlan.releaseId, releaseId));

	// Linked runs with execution stats
	const runs = await db
		.select({
			id: testRun.id,
			name: testRun.name,
			status: testRun.status,
			environment: testRun.environment,
			createdAt: testRun.createdAt,
			total: sql<number>`(select count(*)::int from test_execution where test_run_id = ${col(testRun.id)})`.as('total'),
			pass: sql<number>`(select count(*)::int from test_execution where test_run_id = ${col(testRun.id)} and status = 'PASS')`.as('pass'),
			fail: sql<number>`(select count(*)::int from test_execution where test_run_id = ${col(testRun.id)} and status = 'FAIL')`.as('fail'),
			blocked: sql<number>`(select count(*)::int from test_execution where test_run_id = ${col(testRun.id)} and status = 'BLOCKED')`.as('blocked')
		})
		.from(testRun)
		.where(eq(testRun.releaseId, releaseId));

	// Aggregate stats
	const totalExec = runs.reduce((s, r) => s + Number(r.total), 0);
	const totalPass = runs.reduce((s, r) => s + Number(r.pass), 0);
	const totalFail = runs.reduce((s, r) => s + Number(r.fail), 0);
	const totalBlocked = runs.reduce((s, r) => s + Number(r.blocked), 0);
	const passRate = totalExec > 0 ? Math.round((totalPass / totalExec) * 100) : 0;

	return json({
		...rel,
		createdByName: creator?.name ?? '',
		plans,
		runs,
		stats: { total: totalExec, pass: totalPass, fail: totalFail, blocked: totalBlocked, passRate }
	});
});

export const PATCH = withProjectRole(['PROJECT_ADMIN', 'QA'], async ({ request, params, projectId }) => {
	const releaseId = Number(params.releaseId);
	if (!Number.isFinite(releaseId)) error(400, 'Invalid release ID');

	const rel = await db.query.release.findFirst({
		where: and(eq(release.id, releaseId), eq(release.projectId, projectId))
	});
	if (!rel) return notFound('Release not found');

	const body = await parseJsonBody(request);
	const parsed = updateReleaseSchema.safeParse(body);
	if (!parsed.success) {
		return validationError('Invalid input', parsed.error.flatten().fieldErrors);
	}

	const updates: Record<string, unknown> = {};
	if (parsed.data.name !== undefined) updates.name = parsed.data.name;
	if (parsed.data.version !== undefined) updates.version = parsed.data.version;
	if (parsed.data.description !== undefined) updates.description = parsed.data.description;
	if (parsed.data.status !== undefined) updates.status = parsed.data.status;
	if (parsed.data.targetDate !== undefined) updates.targetDate = parsed.data.targetDate ? new Date(parsed.data.targetDate) : null;
	if (parsed.data.releaseDate !== undefined) updates.releaseDate = parsed.data.releaseDate ? new Date(parsed.data.releaseDate) : null;

	if (Object.keys(updates).length === 0) {
		return badRequest('No fields to update');
	}

	const [updated] = await db
		.update(release)
		.set(updates)
		.where(and(eq(release.id, releaseId), eq(release.projectId, projectId)))
		.returning();

	return json(updated);
});

export const DELETE = withProjectRole(['PROJECT_ADMIN'], async ({ params, projectId }) => {
	const releaseId = Number(params.releaseId);
	if (!Number.isFinite(releaseId)) error(400, 'Invalid release ID');

	const rel = await db.query.release.findFirst({
		where: and(eq(release.id, releaseId), eq(release.projectId, projectId))
	});
	if (!rel) return notFound('Release not found');

	await db.delete(release).where(and(eq(release.id, releaseId), eq(release.projectId, projectId)));

	return json({ success: true });
});
