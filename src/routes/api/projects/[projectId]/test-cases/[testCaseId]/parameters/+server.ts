import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { testCaseParameter } from '$lib/server/db/schema';
import { eq, and, asc } from 'drizzle-orm';
import { parseJsonBody, parseId } from '$lib/server/auth-utils';
import { withProjectAccess, withProjectRole } from '$lib/server/api-handler';
import { requireTestCase } from '$lib/server/queries';
import { badRequest } from '$lib/server/errors';

export const GET = withProjectAccess(async ({ params, projectId }) => {
	const testCaseId = parseId(params.testCaseId, 'test case ID');
	await requireTestCase(testCaseId, projectId);

	const parameters = await db
		.select()
		.from(testCaseParameter)
		.where(eq(testCaseParameter.testCaseId, testCaseId))
		.orderBy(asc(testCaseParameter.orderIndex));

	return json(parameters);
});

export const POST = withProjectRole(['PROJECT_ADMIN', 'QA', 'DEV'], async ({ params, request, projectId }) => {
	const testCaseId = parseId(params.testCaseId, 'test case ID');
	await requireTestCase(testCaseId, projectId);

	const body = await parseJsonBody(request);
	const { name } = body as { name: string };

	if (!name?.trim()) return badRequest('Parameter name is required');

	// Check uniqueness
	const existing = await db.query.testCaseParameter.findFirst({
		where: and(eq(testCaseParameter.testCaseId, testCaseId), eq(testCaseParameter.name, name.trim()))
	});
	if (existing) return badRequest('Parameter name already exists');

	// Get max order
	const params_list = await db
		.select({ orderIndex: testCaseParameter.orderIndex })
		.from(testCaseParameter)
		.where(eq(testCaseParameter.testCaseId, testCaseId))
		.orderBy(asc(testCaseParameter.orderIndex));
	const maxOrder = params_list.length > 0 ? params_list[params_list.length - 1].orderIndex + 1 : 0;

	const [param] = await db
		.insert(testCaseParameter)
		.values({ testCaseId, name: name.trim(), orderIndex: maxOrder })
		.returning();

	return json(param, { status: 201 });
});
