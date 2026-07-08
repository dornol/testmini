import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { moduleTestCase, module } from '$lib/server/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { withProjectRole } from '$lib/server/api-handler';
import { parseJsonBody } from '$lib/server/auth-utils';
import { badRequest, notFound } from '$lib/server/errors';

export const POST = withProjectRole(['PROJECT_ADMIN', 'QA', 'DEV'], async ({ request, params, projectId }) => {
	const moduleId = Number(params.moduleId);
	if (!Number.isFinite(moduleId)) return badRequest('Invalid module ID');

	// Verify module belongs to project
	const mod = await db.query.module.findFirst({
		where: and(eq(module.id, moduleId), eq(module.projectId, projectId))
	});
	if (!mod) return notFound('Module not found');

	const body = await parseJsonBody(request) as { testCaseIds?: number[] };
	const testCaseIds = body?.testCaseIds;
	if (!Array.isArray(testCaseIds) || testCaseIds.length === 0) {
		return badRequest('testCaseIds must be a non-empty array');
	}

	const values = testCaseIds.map((tcId) => ({ moduleId, testCaseId: tcId }));
	await db.insert(moduleTestCase).values(values).onConflictDoNothing();

	return json({ added: testCaseIds.length });
});

export const DELETE = withProjectRole(['PROJECT_ADMIN', 'QA', 'DEV'], async ({ request, params, projectId }) => {
	const moduleId = Number(params.moduleId);
	if (!Number.isFinite(moduleId)) return badRequest('Invalid module ID');

	const mod = await db.query.module.findFirst({
		where: and(eq(module.id, moduleId), eq(module.projectId, projectId))
	});
	if (!mod) return notFound('Module not found');

	const body = await parseJsonBody(request) as { testCaseIds?: number[] };
	const testCaseIds = body?.testCaseIds;
	if (!Array.isArray(testCaseIds) || testCaseIds.length === 0) {
		return badRequest('testCaseIds must be a non-empty array');
	}

	await db
		.delete(moduleTestCase)
		.where(
			and(
				eq(moduleTestCase.moduleId, moduleId),
				inArray(moduleTestCase.testCaseId, testCaseIds)
			)
		);

	return json({ removed: testCaseIds.length });
});
