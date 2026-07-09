import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { sharedDataSet, testCase, testCaseParameter, testCaseDataSet } from '$lib/server/db/schema';
import { eq, and, asc } from 'drizzle-orm';
import { parseJsonBody, parseId } from '$lib/server/auth-utils';
import { withProjectRole } from '$lib/server/api-handler';
import { badRequest, notFound } from '$lib/server/errors';
import { validateRequestBody } from '$lib/server/shared-dataset-validation';

function parsePositiveInteger(value: unknown, label: string): number | Response {
	const parsed = typeof value === 'number' ? value : Number(value);
	if (!Number.isInteger(parsed) || parsed <= 0) {
		return badRequest(`${label} must be a positive integer`);
	}
	return parsed;
}

function getStringArray(value: unknown, label: string): string[] | Response {
	if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
		return badRequest(`${label} is invalid`);
	}
	return value;
}

function getRows(value: unknown): Record<string, string>[] | Response {
	if (
		!Array.isArray(value) ||
		value.some(
			(row) =>
				!row ||
				typeof row !== 'object' ||
				Array.isArray(row) ||
				Object.values(row).some((rowValue) => typeof rowValue !== 'string')
		)
	) {
		return badRequest('Shared data set rows are invalid');
	}
	return value as Record<string, string>[];
}

export const POST = withProjectRole(
	['PROJECT_ADMIN', 'QA', 'DEV'],
	async ({ params, request, projectId }) => {
		const datasetId = parseId(params.datasetId, 'dataset ID');

		const ds = await db.query.sharedDataSet.findFirst({
			where: and(eq(sharedDataSet.id, datasetId), eq(sharedDataSet.projectId, projectId))
		});
		if (!ds) return notFound('Shared data set not found');

		const dsParams = getStringArray(ds.parameters, 'Shared data set parameters');
		if (dsParams instanceof Response) return dsParams;

		const dsRows = getRows(ds.rows);
		if (dsRows instanceof Response) return dsRows;

		const bodyOrError = validateRequestBody(await parseJsonBody(request));
		if (bodyOrError instanceof Response) return bodyOrError;

		if (bodyOrError.testCaseId === undefined || bodyOrError.testCaseId === null) {
			return badRequest('testCaseId is required');
		}
		const testCaseId = parsePositiveInteger(bodyOrError.testCaseId, 'testCaseId');
		if (testCaseId instanceof Response) return testCaseId;

		const tc = await db.query.testCase.findFirst({
			where: and(eq(testCase.id, testCaseId), eq(testCase.projectId, projectId))
		});
		if (!tc) return notFound('Test case not found');

		// Ensure parameters exist on test case
		const existingParams = await db
			.select()
			.from(testCaseParameter)
			.where(eq(testCaseParameter.testCaseId, testCaseId))
			.orderBy(asc(testCaseParameter.orderIndex));

		const existingNames = new Set(existingParams.map((p) => p.name));
		let maxOrder =
			existingParams.length > 0 ? existingParams[existingParams.length - 1].orderIndex + 1 : 0;

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
	}
);
