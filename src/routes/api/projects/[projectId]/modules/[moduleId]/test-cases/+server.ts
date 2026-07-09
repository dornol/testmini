import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { moduleTestCase, module } from '$lib/server/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { withProjectRole } from '$lib/server/api-handler';
import { parseJsonBody } from '$lib/server/auth-utils';
import { badRequest, notFound } from '$lib/server/errors';
import {
	validatePositiveInteger,
	validatePositiveIntegerList,
	validateRequestBody
} from '$lib/server/id-list-validation';

export const POST = withProjectRole(
	['PROJECT_ADMIN', 'QA', 'DEV'],
	async ({ request, params, projectId }) => {
		const moduleId = validatePositiveInteger(params.moduleId, 'module ID');
		if (moduleId instanceof Response) return moduleId;

		// Verify module belongs to project
		const mod = await db.query.module.findFirst({
			where: and(eq(module.id, moduleId), eq(module.projectId, projectId))
		});
		if (!mod) return notFound('Module not found');

		const bodyOrError = validateRequestBody(await parseJsonBody(request));
		if (bodyOrError instanceof Response) return bodyOrError;

		const testCaseIds = validatePositiveIntegerList(bodyOrError.testCaseIds, 'testCaseIds');
		if (testCaseIds instanceof Response) return testCaseIds;

		const values = testCaseIds.map((tcId) => ({ moduleId, testCaseId: tcId }));
		await db.insert(moduleTestCase).values(values).onConflictDoNothing();

		return json({ added: testCaseIds.length });
	}
);

export const DELETE = withProjectRole(
	['PROJECT_ADMIN', 'QA', 'DEV'],
	async ({ request, params, projectId }) => {
		const moduleId = validatePositiveInteger(params.moduleId, 'module ID');
		if (moduleId instanceof Response) return moduleId;

		const mod = await db.query.module.findFirst({
			where: and(eq(module.id, moduleId), eq(module.projectId, projectId))
		});
		if (!mod) return notFound('Module not found');

		const bodyOrError = validateRequestBody(await parseJsonBody(request));
		if (bodyOrError instanceof Response) return bodyOrError;

		const testCaseIds = validatePositiveIntegerList(bodyOrError.testCaseIds, 'testCaseIds');
		if (testCaseIds instanceof Response) return testCaseIds;

		await db
			.delete(moduleTestCase)
			.where(
				and(eq(moduleTestCase.moduleId, moduleId), inArray(moduleTestCase.testCaseId, testCaseIds))
			);

		return json({ removed: testCaseIds.length });
	}
);
