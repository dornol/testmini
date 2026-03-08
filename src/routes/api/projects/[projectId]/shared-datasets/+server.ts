import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { sharedDataSet } from '$lib/server/db/schema';
import { eq, asc } from 'drizzle-orm';
import { parseJsonBody } from '$lib/server/auth-utils';
import { withProjectAccess, withProjectRole } from '$lib/server/api-handler';
import { badRequest } from '$lib/server/errors';

export const GET = withProjectAccess(async ({ projectId }) => {
	const dataSets = await db
		.select()
		.from(sharedDataSet)
		.where(eq(sharedDataSet.projectId, projectId))
		.orderBy(asc(sharedDataSet.name));

	return json(dataSets);
});

export const POST = withProjectRole(['PROJECT_ADMIN', 'QA', 'DEV'], async ({ request, user, projectId }) => {
	const body = await parseJsonBody(request);
	const { name, parameters, rows } = body as {
		name: string;
		parameters: string[];
		rows: Record<string, string>[];
	};

	if (!name?.trim()) return badRequest('Name is required');
	if (!parameters || !Array.isArray(parameters) || parameters.length === 0) {
		return badRequest('At least one parameter is required');
	}

	const [ds] = await db
		.insert(sharedDataSet)
		.values({
			projectId,
			name: name.trim(),
			parameters,
			rows: rows ?? [],
			createdBy: user.id
		})
		.returning();

	return json(ds, { status: 201 });
});
