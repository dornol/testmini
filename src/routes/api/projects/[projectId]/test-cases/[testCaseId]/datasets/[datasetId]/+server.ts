import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { testCase, testCaseDataSet } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { parseJsonBody } from '$lib/server/auth-utils';
import { withProjectRole } from '$lib/server/api-handler';
import { notFound } from '$lib/server/errors';

export const PATCH = withProjectRole(['PROJECT_ADMIN', 'QA', 'DEV'], async ({ params, request, projectId }) => {
	const testCaseId = Number(params.testCaseId);
	const datasetId = Number(params.datasetId);

	const tc = await db.query.testCase.findFirst({
		where: and(eq(testCase.id, testCaseId), eq(testCase.projectId, projectId))
	});
	if (!tc) return notFound('Test case not found');

	const ds = await db.query.testCaseDataSet.findFirst({
		where: and(eq(testCaseDataSet.id, datasetId), eq(testCaseDataSet.testCaseId, testCaseId))
	});
	if (!ds) return notFound('Data set not found');

	const body = await parseJsonBody(request);
	const { name, values, orderIndex } = body as {
		name?: string | null;
		values?: Record<string, string>;
		orderIndex?: number;
	};

	const updates: Record<string, unknown> = {};
	if (name !== undefined) updates.name = name?.trim() || null;
	if (values !== undefined) updates.values = values;
	if (orderIndex !== undefined) updates.orderIndex = orderIndex;

	if (Object.keys(updates).length > 0) {
		await db.update(testCaseDataSet).set(updates).where(eq(testCaseDataSet.id, datasetId));
	}

	return json({ success: true });
});

export const DELETE = withProjectRole(['PROJECT_ADMIN', 'QA', 'DEV'], async ({ params, projectId }) => {
	const testCaseId = Number(params.testCaseId);
	const datasetId = Number(params.datasetId);

	const tc = await db.query.testCase.findFirst({
		where: and(eq(testCase.id, testCaseId), eq(testCase.projectId, projectId))
	});
	if (!tc) return notFound('Test case not found');

	const ds = await db.query.testCaseDataSet.findFirst({
		where: and(eq(testCaseDataSet.id, datasetId), eq(testCaseDataSet.testCaseId, testCaseId))
	});
	if (!ds) return notFound('Data set not found');

	await db.delete(testCaseDataSet).where(eq(testCaseDataSet.id, datasetId));

	return json({ success: true });
});
