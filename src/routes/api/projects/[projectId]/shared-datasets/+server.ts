import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { sharedDataSet } from '$lib/server/db/schema';
import { eq, asc } from 'drizzle-orm';
import { parseJsonBody } from '$lib/server/auth-utils';
import { withProjectAccess, withProjectRole } from '$lib/server/api-handler';
import {
	SHARED_DATASET_FIELDS,
	validateDataSetName,
	validateDataSetParameters,
	validateDataSetRows,
	validateRequestFields,
	validateRequestBody
} from '$lib/server/shared-dataset-validation';

export const GET = withProjectAccess(async ({ projectId }) => {
	const dataSets = await db
		.select()
		.from(sharedDataSet)
		.where(eq(sharedDataSet.projectId, projectId))
		.orderBy(asc(sharedDataSet.name));

	return json(dataSets);
});

export const POST = withProjectRole(
	['PROJECT_ADMIN', 'QA', 'DEV'],
	async ({ request, user, projectId }) => {
		const bodyOrError = validateRequestBody(await parseJsonBody(request));
		if (bodyOrError instanceof Response) return bodyOrError;
		const fieldError = validateRequestFields(bodyOrError, SHARED_DATASET_FIELDS);
		if (fieldError) return fieldError;

		const nameOrError = validateDataSetName(bodyOrError.name);
		if (nameOrError instanceof Response) return nameOrError;

		const parametersOrError = validateDataSetParameters(bodyOrError.parameters);
		if (parametersOrError instanceof Response) return parametersOrError;

		const rowsOrError = validateDataSetRows(bodyOrError.rows, parametersOrError);
		if (rowsOrError instanceof Response) return rowsOrError;

		const [ds] = await db
			.insert(sharedDataSet)
			.values({
				projectId,
				name: nameOrError,
				parameters: parametersOrError,
				rows: rowsOrError,
				createdBy: user.id
			})
			.returning();

		if (!ds) {
			error(500, 'Failed to create shared data set');
		}

		return json(ds, { status: 201 });
	}
);
