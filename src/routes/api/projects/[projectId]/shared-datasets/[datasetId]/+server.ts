import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { sharedDataSet } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { parseJsonBody } from '$lib/server/auth-utils';
import { withProjectRole } from '$lib/server/api-handler';
import { notFound } from '$lib/server/errors';

export const PATCH = withProjectRole(['PROJECT_ADMIN', 'QA', 'DEV'], async ({ params, request, projectId }) => {
	const datasetId = Number(params.datasetId);

	const ds = await db.query.sharedDataSet.findFirst({
		where: and(eq(sharedDataSet.id, datasetId), eq(sharedDataSet.projectId, projectId))
	});
	if (!ds) return notFound('Shared data set not found');

	const body = await parseJsonBody(request);
	const { name, parameters, rows } = body as {
		name?: string;
		parameters?: string[];
		rows?: Record<string, string>[];
	};

	const updates: Record<string, unknown> = {};
	if (name !== undefined) updates.name = name.trim();
	if (parameters !== undefined) updates.parameters = parameters;
	if (rows !== undefined) updates.rows = rows;

	if (Object.keys(updates).length > 0) {
		await db.update(sharedDataSet).set(updates).where(eq(sharedDataSet.id, datasetId));
	}

	return json({ success: true });
});

export const DELETE = withProjectRole(['PROJECT_ADMIN', 'QA', 'DEV'], async ({ params, projectId }) => {
	const datasetId = Number(params.datasetId);

	const ds = await db.query.sharedDataSet.findFirst({
		where: and(eq(sharedDataSet.id, datasetId), eq(sharedDataSet.projectId, projectId))
	});
	if (!ds) return notFound('Shared data set not found');

	await db.delete(sharedDataSet).where(eq(sharedDataSet.id, datasetId));

	return json({ success: true });
});
