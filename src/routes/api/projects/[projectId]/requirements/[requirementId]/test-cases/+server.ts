import { json, error } from '@sveltejs/kit';
import { badRequest } from '$lib/server/errors';
import { db } from '$lib/server/db';
import { requirement, requirementTestCase, testCase } from '$lib/server/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { parseJsonBody, parseId } from '$lib/server/auth-utils';
import { withProjectRole } from '$lib/server/api-handler';
import {
	validatePositiveInteger,
	validatePositiveIntegerList,
	validateRequestBody
} from '$lib/server/id-list-validation';

export const POST = withProjectRole(
	['PROJECT_ADMIN', 'QA'],
	async ({ request, params, projectId }) => {
		const requirementId = parseId(params.requirementId, 'requirement ID');

		const existing = await db.query.requirement.findFirst({
			where: and(eq(requirement.id, requirementId), eq(requirement.projectId, projectId))
		});

		if (!existing) {
			error(404, 'Requirement not found');
		}

		const bodyOrError = validateRequestBody(await parseJsonBody(request));
		if (bodyOrError instanceof Response) return bodyOrError;

		const testCaseIds = validatePositiveIntegerList(bodyOrError.testCaseIds, 'testCaseIds');
		if (testCaseIds instanceof Response) return testCaseIds;

		const validCases = await db
			.select({ id: testCase.id })
			.from(testCase)
			.where(and(eq(testCase.projectId, projectId), inArray(testCase.id, testCaseIds)));
		if (validCases.length !== testCaseIds.length) {
			return badRequest('Some test cases do not belong to this project');
		}

		const values = testCaseIds.map((testCaseId) => ({
			requirementId,
			testCaseId
		}));
		const inserted = await db
			.insert(requirementTestCase)
			.values(values)
			.onConflictDoNothing()
			.returning({ id: requirementTestCase.id });

		return json({ linked: inserted.length }, { status: 201 });
	}
);

export const DELETE = withProjectRole(
	['PROJECT_ADMIN', 'QA'],
	async ({ url, params, projectId }) => {
		const requirementId = parseId(params.requirementId, 'requirement ID');

		const existing = await db.query.requirement.findFirst({
			where: and(eq(requirement.id, requirementId), eq(requirement.projectId, projectId))
		});

		if (!existing) {
			error(404, 'Requirement not found');
		}

		const rawTestCaseId = url.searchParams.get('testCaseId');
		if (rawTestCaseId === null || rawTestCaseId === '') {
			return badRequest('testCaseId query parameter is required');
		}
		const testCaseId = validatePositiveInteger(rawTestCaseId, 'testCaseId');
		if (testCaseId instanceof Response) return testCaseId;

		const existingTestCase = await db.query.testCase.findFirst({
			where: and(eq(testCase.id, testCaseId), eq(testCase.projectId, projectId))
		});
		if (!existingTestCase) {
			error(404, 'Test case not found');
		}

		await db
			.delete(requirementTestCase)
			.where(
				and(
					eq(requirementTestCase.requirementId, requirementId),
					eq(requirementTestCase.testCaseId, testCaseId)
				)
			);

		return json({ success: true });
	}
);
