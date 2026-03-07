import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { testSuite, testSuiteItem, testCase } from '$lib/server/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { parseJsonBody } from '$lib/server/auth-utils';
import { withProjectRole } from '$lib/server/api-handler';
import { suiteItemsSchema } from '$lib/schemas/test-suite.schema';

export const POST = withProjectRole(['PROJECT_ADMIN', 'QA'], async ({ request, params, projectId }) => {
	const suiteId = Number(params.suiteId);

	const suite = await db.query.testSuite.findFirst({
		where: and(eq(testSuite.id, suiteId), eq(testSuite.projectId, projectId))
	});

	if (!suite) {
		error(404, 'Suite not found');
	}

	const body = await parseJsonBody(request);
	const parsed = suiteItemsSchema.safeParse(body);
	if (!parsed.success) {
		return json({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors }, { status: 400 });
	}

	// Validate all test cases belong to the same project
	const validTestCases = await db
		.select({ id: testCase.id })
		.from(testCase)
		.where(and(inArray(testCase.id, parsed.data.testCaseIds), eq(testCase.projectId, projectId)));
	if (validTestCases.length !== parsed.data.testCaseIds.length) {
		return json({ error: 'Some test cases do not belong to this project' }, { status: 400 });
	}

	const values = parsed.data.testCaseIds.map((tcId) => ({
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
});

export const DELETE = withProjectRole(['PROJECT_ADMIN', 'QA'], async ({ request, params, projectId }) => {
	const suiteId = Number(params.suiteId);

	const suite = await db.query.testSuite.findFirst({
		where: and(eq(testSuite.id, suiteId), eq(testSuite.projectId, projectId))
	});

	if (!suite) {
		error(404, 'Suite not found');
	}

	const body = await parseJsonBody(request);
	const parsed = suiteItemsSchema.safeParse(body);
	if (!parsed.success) {
		return json({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors }, { status: 400 });
	}

	await db
		.delete(testSuiteItem)
		.where(
			and(
				eq(testSuiteItem.suiteId, suiteId),
				inArray(testSuiteItem.testCaseId, parsed.data.testCaseIds)
			)
		);

	return json({ success: true });
});
