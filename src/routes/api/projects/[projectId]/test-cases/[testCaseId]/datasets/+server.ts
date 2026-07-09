import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { testCaseDataSet } from '$lib/server/db/schema';
import { eq, asc } from 'drizzle-orm';
import { parseJsonBody, parseId } from '$lib/server/auth-utils';
import { withProjectAccess, withProjectRole } from '$lib/server/api-handler';
import { requireTestCase } from '$lib/server/queries';
import { validateCreateTestCaseDataSetInput } from '$lib/server/test-case-dataset-validation';

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

export const POST = withProjectRole(
	['PROJECT_ADMIN', 'QA', 'DEV'],
	async ({ params, request, projectId }) => {
		const testCaseId = parseId(params.testCaseId, 'test case ID');
		await requireTestCase(testCaseId, projectId);

		const dataSetOrError = validateCreateTestCaseDataSetInput(await parseJsonBody(request));
		if (dataSetOrError instanceof Response) return dataSetOrError;
		const { name, values } = dataSetOrError;

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
				name,
				values,
				orderIndex: maxOrder
			})
			.returning();

		if (!ds) {
			error(500, 'Failed to create data set');
		}

		return json(ds, { status: 201 });
	}
);
