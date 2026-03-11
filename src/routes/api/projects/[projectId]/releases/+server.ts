import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { release, testPlan, testRun, testExecution, user } from '$lib/server/db/schema';
import { eq, and, sql, count } from 'drizzle-orm';
import { parseJsonBody } from '$lib/server/auth-utils';
import { withProjectAccess, withProjectRole } from '$lib/server/api-handler';
import { createReleaseSchema } from '$lib/schemas/release.schema';
import { validationError } from '$lib/server/errors';

export const GET = withProjectAccess(async ({ projectId, url }) => {
	const statusFilter = url.searchParams.get('status');

	const conditions = [eq(release.projectId, projectId)];
	if (statusFilter) {
		conditions.push(eq(release.status, statusFilter as typeof release.status.enumValues[number]));
	}

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
			planCount: sql<number>`(select count(*) from test_plan where release_id = ${release.id})`.as('plan_count'),
			runCount: sql<number>`(select count(*) from test_run where release_id = ${release.id})`.as('run_count')
		})
		.from(release)
		.innerJoin(user, eq(release.createdBy, user.id))
		.where(and(...conditions))
		.orderBy(release.createdAt);

	return json(releases);
});

export const POST = withProjectRole(['PROJECT_ADMIN', 'QA'], async ({ request, projectId, user: currentUser }) => {
	const body = await parseJsonBody(request);
	const parsed = createReleaseSchema.safeParse(body);
	if (!parsed.success) {
		return validationError('Invalid input', parsed.error.flatten().fieldErrors);
	}

	const [created] = await db
		.insert(release)
		.values({
			projectId,
			name: parsed.data.name,
			version: parsed.data.version ?? null,
			description: parsed.data.description ?? null,
			status: parsed.data.status ?? 'PLANNING',
			targetDate: parsed.data.targetDate ? new Date(parsed.data.targetDate) : null,
			releaseDate: parsed.data.releaseDate ? new Date(parsed.data.releaseDate) : null,
			createdBy: currentUser.id
		})
		.returning();

	return json(created, { status: 201 });
});
