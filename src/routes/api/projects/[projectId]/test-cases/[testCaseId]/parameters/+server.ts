import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { testCase, testCaseParameter } from '$lib/server/db/schema';
import { eq, and, asc } from 'drizzle-orm';
import { parseJsonBody } from '$lib/server/auth-utils';
import { withProjectAccess, withProjectRole } from '$lib/server/api-handler';
import { badRequest, notFound } from '$lib/server/errors';

export const GET = withProjectAccess(async ({ params, projectId }) => {
	const testCaseId = Number(params.testCaseId);

	const tc = await db.query.testCase.findFirst({
		where: and(eq(testCase.id, testCaseId), eq(testCase.projectId, projectId))
	});
	if (!tc) return notFound('Test case not found');

	const parameters = await db
		.select()
		.from(testCaseParameter)
		.where(eq(testCaseParameter.testCaseId, testCaseId))
		.orderBy(asc(testCaseParameter.orderIndex));

	return json(parameters);
});

export const POST = withProjectRole(['PROJECT_ADMIN', 'QA', 'DEV'], async ({ params, request, projectId }) => {
	const testCaseId = Number(params.testCaseId);

	const tc = await db.query.testCase.findFirst({
		where: and(eq(testCase.id, testCaseId), eq(testCase.projectId, projectId))
	});
	if (!tc) return notFound('Test case not found');

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
