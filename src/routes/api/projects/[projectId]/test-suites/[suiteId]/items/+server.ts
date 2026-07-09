import { json, error } from '@sveltejs/kit';
import { badRequest } from '$lib/server/errors';
import { db } from '$lib/server/db';
import { testSuite, testSuiteItem, testCase } from '$lib/server/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { parseJsonBody, parseId } from '$lib/server/auth-utils';
import { withProjectRole } from '$lib/server/api-handler';
import { validatePositiveIntegerList, validateRequestBody } from '$lib/server/id-list-validation';

const SUITE_ITEMS_FIELDS = new Set(['testCaseIds']);

export const POST = withProjectRole(
	['PROJECT_ADMIN', 'QA'],
	async ({ request, params, projectId }) => {
		const suiteId = parseId(params.suiteId, 'suite ID');

		const suite = await db.query.testSuite.findFirst({
			where: and(eq(testSuite.id, suiteId), eq(testSuite.projectId, projectId))
		});

		if (!suite) {
			error(404, 'Suite not found');
		}

		const bodyOrError = validateRequestBody(await parseJsonBody(request));
		if (bodyOrError instanceof Response) return bodyOrError;
		if (Object.keys(bodyOrError).some((key) => !SUITE_ITEMS_FIELDS.has(key))) {
			return badRequest('Invalid suite item field');
		}

		const testCaseIds = validatePositiveIntegerList(bodyOrError.testCaseIds, 'testCaseIds');
		if (testCaseIds instanceof Response) return testCaseIds;

		// Validate all test cases belong to the same project
		const validTestCases = await db
			.select({ id: testCase.id })
			.from(testCase)
			.where(and(inArray(testCase.id, testCaseIds), eq(testCase.projectId, projectId)));
		if (validTestCases.length !== testCaseIds.length) {
			return badRequest('Some test cases do not belong to this project');
		}

		const values = testCaseIds.map((tcId) => ({
			suiteId,
			testCaseId: tcId
		}));

		// Use ON CONFLICT DO NOTHING to ignore duplicates
		for (const value of values) {
			try {
				await db.insert(testSuiteItem).values(value);
			} catch {
				// ignore duplicate constraint violations
			}
		}

		return json({ success: true });
	}
);

export const DELETE = withProjectRole(
	['PROJECT_ADMIN', 'QA'],
	async ({ request, params, projectId }) => {
		const suiteId = parseId(params.suiteId, 'suite ID');

		const suite = await db.query.testSuite.findFirst({
			where: and(eq(testSuite.id, suiteId), eq(testSuite.projectId, projectId))
		});

		if (!suite) {
			error(404, 'Suite not found');
		}

		const bodyOrError = validateRequestBody(await parseJsonBody(request));
		if (bodyOrError instanceof Response) return bodyOrError;
		if (Object.keys(bodyOrError).some((key) => !SUITE_ITEMS_FIELDS.has(key))) {
			return badRequest('Invalid suite item field');
		}

		const testCaseIds = validatePositiveIntegerList(bodyOrError.testCaseIds, 'testCaseIds');
		if (testCaseIds instanceof Response) return testCaseIds;

		await db
			.delete(testSuiteItem)
			.where(
				and(eq(testSuiteItem.suiteId, suiteId), inArray(testSuiteItem.testCaseId, testCaseIds))
			);

		return json({ success: true });
	}
);
