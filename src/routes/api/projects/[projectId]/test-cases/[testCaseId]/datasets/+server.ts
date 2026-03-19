import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { testCaseDataSet } from '$lib/server/db/schema';
import { eq, asc } from 'drizzle-orm';
import { parseJsonBody, parseId } from '$lib/server/auth-utils';
import { withProjectAccess, withProjectRole } from '$lib/server/api-handler';
import { requireTestCase } from '$lib/server/queries';
import { badRequest } from '$lib/server/errors';

export const GET = withProjectAccess(async ({ params, projectId }) => {
	const testCaseId = parseId(params.testCaseId, 'test case ID');
	await requireTestCase(testCaseId, projectId);

	const dataSets = await db
		.select()
		.from(testCaseDataSet)
		.where(eq(testCaseDataSet.testCaseId, testCaseId))
		.orderBy(asc(testCaseDataSet.orderIndex));

	return json(dataSets);
});

export const POST = withProjectRole(['PROJECT_ADMIN', 'QA', 'DEV'], async ({ params, request, projectId }) => {
	const testCaseId = parseId(params.testCaseId, 'test case ID');
	await requireTestCase(testCaseId, projectId);

	const body = await parseJsonBody(request);
	const { name, values } = body as { name?: string; values: Record<string, string> };

	if (!values || typeof values !== 'object') return badRequest('values is required');

	// Get max order
	const existing = await db
		.select({ orderIndex: testCaseDataSet.orderIndex })
		.from(testCaseDataSet)
		.where(eq(testCaseDataSet.testCaseId, testCaseId))
		.orderBy(asc(testCaseDataSet.orderIndex));
	const maxOrder = existing.length > 0 ? existing[existing.length - 1].orderIndex + 1 : 0;

	const [ds] = await db
		.insert(testCaseDataSet)
		.values({
			testCaseId,
			name: name?.trim() || null,
			values,
			orderIndex: maxOrder
		})
		.returning();

	return json(ds, { status: 201 });
});
