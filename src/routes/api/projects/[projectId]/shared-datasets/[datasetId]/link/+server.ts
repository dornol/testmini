import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { sharedDataSet, testCase, testCaseParameter, testCaseDataSet } from '$lib/server/db/schema';
import { eq, and, asc } from 'drizzle-orm';
import { parseJsonBody } from '$lib/server/auth-utils';
import { withProjectRole } from '$lib/server/api-handler';
import { badRequest, notFound } from '$lib/server/errors';

export const POST = withProjectRole(['PROJECT_ADMIN', 'QA', 'DEV'], async ({ params, request, projectId }) => {
	const datasetId = Number(params.datasetId);

	const ds = await db.query.sharedDataSet.findFirst({
		where: and(eq(sharedDataSet.id, datasetId), eq(sharedDataSet.projectId, projectId))
	});
	if (!ds) return notFound('Shared data set not found');

	const body = await parseJsonBody(request);
	const { testCaseId } = body as { testCaseId: number };

	if (!testCaseId) return badRequest('testCaseId is required');

	const tc = await db.query.testCase.findFirst({
		where: and(eq(testCase.id, testCaseId), eq(testCase.projectId, projectId))
	});
	if (!tc) return notFound('Test case not found');

	const dsParams = (ds.parameters as string[]) ?? [];
	const dsRows = (ds.rows as Record<string, string>[]) ?? [];

	// Ensure parameters exist on test case
	const existingParams = await db
		.select()
		.from(testCaseParameter)
		.where(eq(testCaseParameter.testCaseId, testCaseId))
		.orderBy(asc(testCaseParameter.orderIndex));

	const existingNames = new Set(existingParams.map((p) => p.name));
	let maxOrder = existingParams.length > 0 ? existingParams[existingParams.length - 1].orderIndex + 1 : 0;

	for (const pName of dsParams) {
		if (!existingNames.has(pName)) {
			await db.insert(testCaseParameter).values({
				testCaseId,
				name: pName,
				orderIndex: maxOrder++
			});
		}
	}

	// Add data set rows
	const existingDs = await db
		.select({ orderIndex: testCaseDataSet.orderIndex })
		.from(testCaseDataSet)
		.where(eq(testCaseDataSet.testCaseId, testCaseId))
		.orderBy(asc(testCaseDataSet.orderIndex));
	let dsOrder = existingDs.length > 0 ? existingDs[existingDs.length - 1].orderIndex + 1 : 0;

	if (dsRows.length > 0) {
		const values = dsRows.map((row) => ({
			testCaseId,
			name: null as string | null,
			values: row,
			orderIndex: dsOrder++
		}));
		await db.insert(testCaseDataSet).values(values);
	}

	return json({ linked: dsRows.length });
});
