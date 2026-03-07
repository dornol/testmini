import { json } from '@sveltejs/kit';
import { badRequest, conflict } from '$lib/server/errors';
import { db } from '$lib/server/db';
import { testCaseGroup, testCase } from '$lib/server/db/schema';
import { eq, sql, count, asc } from 'drizzle-orm';
import { parseJsonBody } from '$lib/server/auth-utils';
import { withProjectAccess, withProjectRole } from '$lib/server/api-handler';

export const GET = withProjectAccess(async ({ projectId }) => {
	const groups = await db
		.select({
			id: testCaseGroup.id,
			name: testCaseGroup.name,
			sortOrder: testCaseGroup.sortOrder,
			color: testCaseGroup.color,
			testCaseCount: count(testCase.id)
		})
		.from(testCaseGroup)
		.leftJoin(testCase, eq(testCase.groupId, testCaseGroup.id))
		.where(eq(testCaseGroup.projectId, projectId))
		.groupBy(testCaseGroup.id)
		.orderBy(asc(testCaseGroup.sortOrder));

	return json(groups);
});

export const POST = withProjectRole(['PROJECT_ADMIN', 'QA', 'DEV'], async ({ request, user, projectId }) => {

	const body = await parseJsonBody(request);
	const { name, color } = body as { name: string; color?: string };

	if (!name || !name.trim()) {
		return badRequest('Name is required');
	}

	if (color !== undefined && color !== null && !/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color)) {
		return badRequest('Invalid HEX color format');
	}

	// Check uniqueness
	const existing = await db.query.testCaseGroup.findFirst({
		where: (g, { and, eq }) => and(eq(g.projectId, projectId), eq(g.name, name.trim()))
	});
	if (existing) {
		return conflict('A group with this name already exists');
	}

	// Get max sortOrder
	const [maxResult] = await db
		.select({ maxOrder: sql<number>`coalesce(max(${testCaseGroup.sortOrder}), 0)` })
		.from(testCaseGroup)
		.where(eq(testCaseGroup.projectId, projectId));

	const [created] = await db
		.insert(testCaseGroup)
		.values({
			projectId,
			name: name.trim(),
			sortOrder: (maxResult?.maxOrder ?? 0) + 1000,
			color: color || null,
			createdBy: user.id
		})
		.returning();

	return json(created, { status: 201 });
});
