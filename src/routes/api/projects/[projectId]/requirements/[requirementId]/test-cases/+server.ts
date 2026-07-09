import { json, error } from '@sveltejs/kit';
import { badRequest } from '$lib/server/errors';
import { db } from '$lib/server/db';
import { requirement, requirementTestCase } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
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

		await db
			.insert(requirementTestCase)
			.values(
				testCaseIds.map((testCaseId) => ({
					requirementId,
					testCaseId
				}))
			)
			.onConflictDoNothing();

		return json({ linked: testCaseIds.length }, { status: 201 });
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
