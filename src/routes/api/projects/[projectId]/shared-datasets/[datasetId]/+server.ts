import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { sharedDataSet } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { parseJsonBody, parseId } from '$lib/server/auth-utils';
import { withProjectRole } from '$lib/server/api-handler';
import { badRequest, notFound } from '$lib/server/errors';
import {
	SHARED_DATASET_FIELDS,
	validateDataSetName,
	validateDataSetParameters,
	validateDataSetRows,
	validateRequestFields,
	validateRequestBody
} from '$lib/server/shared-dataset-validation';

export const PATCH = withProjectRole(
	['PROJECT_ADMIN', 'QA', 'DEV'],
	async ({ params, request, projectId }) => {
		const datasetId = parseId(params.datasetId, 'dataset ID');

		const bodyOrError = validateRequestBody(await parseJsonBody(request));
		if (bodyOrError instanceof Response) return bodyOrError;
		const fieldError = validateRequestFields(bodyOrError, SHARED_DATASET_FIELDS);
		if (fieldError) return fieldError;
		if (Object.keys(bodyOrError).length === 0) return badRequest('No fields to update');

		const ds = await db.query.sharedDataSet.findFirst({
			where: and(eq(sharedDataSet.id, datasetId), eq(sharedDataSet.projectId, projectId))
		});
		if (!ds) return notFound('Shared data set not found');

		const updates: Record<string, unknown> = {};

		if (bodyOrError.name !== undefined) {
			const nameOrError = validateDataSetName(bodyOrError.name);
			if (nameOrError instanceof Response) return nameOrError;
			updates.name = nameOrError;
		}

		let parameters = (ds.parameters as string[]) ?? [];
		if (bodyOrError.parameters !== undefined) {
			const parametersOrError = validateDataSetParameters(bodyOrError.parameters);
			if (parametersOrError instanceof Response) return parametersOrError;
			parameters = parametersOrError;
			updates.parameters = parametersOrError;
		}

		if (bodyOrError.rows !== undefined) {
			const rowsOrError = validateDataSetRows(bodyOrError.rows, parameters);
			if (rowsOrError instanceof Response) return rowsOrError;
			updates.rows = rowsOrError;
		}

		if (Object.keys(updates).length === 0) return badRequest('No fields to update');

		const [updated] = await db
			.update(sharedDataSet)
			.set(updates)
			.where(and(eq(sharedDataSet.id, datasetId), eq(sharedDataSet.projectId, projectId)))
			.returning();
		if (!updated) return notFound('Shared data set not found');

		return json({ success: true });
	}
);

export const DELETE = withProjectRole(
	['PROJECT_ADMIN', 'QA', 'DEV'],
	async ({ params, projectId }) => {
		const datasetId = parseId(params.datasetId, 'dataset ID');

		const ds = await db.query.sharedDataSet.findFirst({
			where: and(eq(sharedDataSet.id, datasetId), eq(sharedDataSet.projectId, projectId))
		});
		if (!ds) return notFound('Shared data set not found');

		const [deleted] = await db
			.delete(sharedDataSet)
			.where(and(eq(sharedDataSet.id, datasetId), eq(sharedDataSet.projectId, projectId)))
			.returning();
		if (!deleted) return notFound('Shared data set not found');

		return json({ success: true });
	}
);
