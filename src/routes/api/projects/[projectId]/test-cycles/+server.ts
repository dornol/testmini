import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { testCycle, testRun, user } from '$lib/server/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { withProjectAccess, withProjectRole } from '$lib/server/api-handler';
import { parseJsonBody } from '$lib/server/auth-utils';
import { createTestCycleSchema } from '$lib/schemas/test-cycle.schema';
import { validationError, conflict } from '$lib/server/errors';

export const GET = withProjectAccess(async ({ projectId, url }) => {
	const statusFilter = url.searchParams.get('status');

	const conditions = [eq(testCycle.projectId, projectId)];
	if (statusFilter) {
		conditions.push(eq(testCycle.status, statusFilter));
	}

	const cycles = await db
		.select({
			id: testCycle.id,
			name: testCycle.name,
			cycleNumber: testCycle.cycleNumber,
			status: testCycle.status,
			releaseId: testCycle.releaseId,
			startDate: testCycle.startDate,
			endDate: testCycle.endDate,
			createdBy: user.name,
			createdAt: testCycle.createdAt,
			runCount: sql<number>`(select count(*) from test_run where test_cycle_id = ${testCycle.id})::int`.as('run_count')
		})
		.from(testCycle)
		.innerJoin(user, eq(testCycle.createdBy, user.id))
		.where(and(...conditions))
		.orderBy(testCycle.cycleNumber);

	return json(cycles);
});

export const POST = withProjectRole(['PROJECT_ADMIN', 'QA'], async ({ request, projectId, user: currentUser }) => {
	const body = await parseJsonBody(request);
	const parsed = createTestCycleSchema.safeParse(body);
	if (!parsed.success) {
		return validationError('Invalid input', parsed.error.flatten().fieldErrors);
	}

	// Check unique cycle number
	const existing = await db.query.testCycle.findFirst({
		where: and(eq(testCycle.projectId, projectId), eq(testCycle.cycleNumber, parsed.data.cycleNumber))
	});
	if (existing) return conflict(`Cycle number ${parsed.data.cycleNumber} already exists`);

	const [created] = await db
		.insert(testCycle)
		.values({
			projectId,
			name: parsed.data.name,
			cycleNumber: parsed.data.cycleNumber,
			status: parsed.data.status ?? 'PLANNED',
			releaseId: parsed.data.releaseId ?? null,
			startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : null,
			endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : null,
			createdBy: currentUser.id
		})
		.returning();

	return json(created, { status: 201 });
});
