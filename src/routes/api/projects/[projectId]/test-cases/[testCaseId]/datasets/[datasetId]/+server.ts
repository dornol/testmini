import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { testCaseDataSet } from '$lib/server/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { parseJsonBody, parseId } from '$lib/server/auth-utils';
import { withProjectRole } from '$lib/server/api-handler';
import { requireTestCase } from '$lib/server/queries';
import { notFound } from '$lib/server/errors';
import { validateUpdateTestCaseDataSetInput } from '$lib/server/test-case-dataset-validation';

export const PATCH = withProjectRole(
	['PROJECT_ADMIN', 'QA', 'DEV'],
	async ({ params, request, projectId }) => {
		const testCaseId = parseId(params.testCaseId, 'test case ID');
		const datasetId = parseId(params.datasetId, 'dataset ID');
		await requireTestCase(testCaseId, projectId);

		const updatesOrError = validateUpdateTestCaseDataSetInput(await parseJsonBody(request));
		if (updatesOrError instanceof Response) return updatesOrError;

		const ds = await db.query.testCaseDataSet.findFirst({
			where: and(eq(testCaseDataSet.id, datasetId), eq(testCaseDataSet.testCaseId, testCaseId))
		});
		if (!ds) return notFound('Data set not found');

		const updates: Record<string, unknown> = {};
		if ('name' in updatesOrError) updates.name = updatesOrError.name ?? null;
		if (updatesOrError.values !== undefined) updates.values = updatesOrError.values;
		if (updatesOrError.orderIndex !== undefined) updates.orderIndex = updatesOrError.orderIndex;

		if (Object.keys(updates).length > 0) {
			const [updated] = await db
				.update(testCaseDataSet)
				.set(updates)
				.where(
					and(
						eq(testCaseDataSet.id, datasetId),
						eq(testCaseDataSet.testCaseId, testCaseId),
						sql`exists (select 1 from test_case where id = ${testCaseId} and project_id = ${projectId})`
					)
				)
				.returning({ id: testCaseDataSet.id });
			if (!updated) return notFound('Data set not found');
		}

		return json({ success: true });
	}
);

export const DELETE = withProjectRole(
	['PROJECT_ADMIN', 'QA', 'DEV'],
	async ({ params, projectId }) => {
		const testCaseId = parseId(params.testCaseId, 'test case ID');
		const datasetId = parseId(params.datasetId, 'dataset ID');
		await requireTestCase(testCaseId, projectId);

		const ds = await db.query.testCaseDataSet.findFirst({
			where: and(eq(testCaseDataSet.id, datasetId), eq(testCaseDataSet.testCaseId, testCaseId))
		});
		if (!ds) return notFound('Data set not found');

		const [deleted] = await db
			.delete(testCaseDataSet)
			.where(
				and(
					eq(testCaseDataSet.id, datasetId),
					eq(testCaseDataSet.testCaseId, testCaseId),
					sql`exists (select 1 from test_case where id = ${testCaseId} and project_id = ${projectId})`
				)
			)
			.returning({ id: testCaseDataSet.id });
		if (!deleted) return notFound('Data set not found');

		return json({ success: true });
	}
);
