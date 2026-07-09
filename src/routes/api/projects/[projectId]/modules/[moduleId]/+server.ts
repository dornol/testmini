import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { module } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { withProjectRole } from '$lib/server/api-handler';
import { parseId, parseJsonObjectBody } from '$lib/server/auth-utils';
import { updateModuleSchema } from '$lib/schemas/module.schema';
import { notFound, badRequest } from '$lib/server/errors';

async function validateParentModule(
	parentModuleId: number | null | undefined,
	projectId: number,
	moduleId: number
) {
	if (parentModuleId === null || parentModuleId === undefined) return undefined;
	if (parentModuleId === moduleId) return badRequest('Module cannot be its own parent');

	const parent = await db.query.module.findFirst({
		where: and(eq(module.id, parentModuleId), eq(module.projectId, projectId)),
		columns: { id: true }
	});

	if (!parent) {
		return badRequest('Parent module not found');
	}
}

export const PUT = withProjectRole(
	['PROJECT_ADMIN', 'QA', 'DEV'],
	async ({ request, params, projectId }) => {
		const moduleId = parseId(params.moduleId, 'module ID');

		const body = await parseJsonObjectBody(request);
		const parsed = updateModuleSchema.safeParse(body);
		if (!parsed.success) return badRequest('Invalid input');

		const parentError = await validateParentModule(parsed.data.parentModuleId, projectId, moduleId);
		if (parentError) return parentError;

		const updates: Record<string, unknown> = {};
		if (parsed.data.name !== undefined) updates.name = parsed.data.name;
		if (parsed.data.parentModuleId !== undefined)
			updates.parentModuleId = parsed.data.parentModuleId;
		if (parsed.data.description !== undefined) updates.description = parsed.data.description;
		if (parsed.data.sortOrder !== undefined) updates.sortOrder = parsed.data.sortOrder;

		if (Object.keys(updates).length === 0) return badRequest('No fields to update');

		const [updated] = await db
			.update(module)
			.set(updates)
			.where(and(eq(module.id, moduleId), eq(module.projectId, projectId)))
			.returning();

		if (!updated) return notFound('Module not found');
		return json(updated);
	}
);

export const DELETE = withProjectRole(['PROJECT_ADMIN'], async ({ params, projectId }) => {
	const moduleId = parseId(params.moduleId, 'module ID');

	const [deleted] = await db
		.delete(module)
		.where(and(eq(module.id, moduleId), eq(module.projectId, projectId)))
		.returning({ id: module.id });

	if (!deleted) return notFound('Module not found');
	return json({ success: true });
});
