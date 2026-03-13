import { json } from '@sveltejs/kit';
import { db, col } from '$lib/server/db';
import { module, moduleTestCase } from '$lib/server/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { withProjectAccess, withProjectRole } from '$lib/server/api-handler';
import { parseJsonBody } from '$lib/server/auth-utils';
import { createModuleSchema } from '$lib/schemas/module.schema';
import { validationError } from '$lib/server/errors';

export const GET = withProjectAccess(async ({ projectId }) => {
	const modules = await db
		.select({
			id: module.id,
			name: module.name,
			parentModuleId: module.parentModuleId,
			description: module.description,
			sortOrder: module.sortOrder,
			createdAt: module.createdAt,
			testCaseCount: sql<number>`(select count(*)::int from module_test_case where module_id = ${col(module.id)})::int`.as('test_case_count')
		})
		.from(module)
		.where(eq(module.projectId, projectId))
		.orderBy(module.sortOrder, module.name);

	return json(modules);
});

export const POST = withProjectRole(['PROJECT_ADMIN', 'QA', 'DEV'], async ({ request, projectId, user: currentUser }) => {
	const body = await parseJsonBody(request);
	const parsed = createModuleSchema.safeParse(body);
	if (!parsed.success) {
		return validationError('Invalid input', parsed.error.flatten().fieldErrors);
	}

	const [created] = await db
		.insert(module)
		.values({
			projectId,
			name: parsed.data.name,
			parentModuleId: parsed.data.parentModuleId ?? null,
			description: parsed.data.description ?? null,
			createdBy: currentUser.id
		})
		.returning();

	return json(created, { status: 201 });
});
