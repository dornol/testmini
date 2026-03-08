import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { customField } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { withProjectRole } from '$lib/server/api-handler';

export const PATCH = withProjectRole(['PROJECT_ADMIN'], async ({ params, request, projectId }) => {
	const fieldId = Number(params.fieldId);
	if (isNaN(fieldId)) error(400, 'Invalid field ID');

	const existing = await db.query.customField.findFirst({
		where: and(eq(customField.id, fieldId), eq(customField.projectId, projectId))
	});
	if (!existing) error(404, 'Custom field not found');

	const body = await request.json();
	const updates: Record<string, unknown> = {};

	if (body.name !== undefined) {
		if (typeof body.name !== 'string' || body.name.trim().length === 0) {
			error(400, 'Name cannot be empty');
		}
		updates.name = body.name.trim();
	}
	if (body.options !== undefined) updates.options = body.options;
	if (body.required !== undefined) updates.required = body.required;
	if (body.sortOrder !== undefined) updates.sortOrder = body.sortOrder;

	if (Object.keys(updates).length === 0) {
		return json(existing);
	}

	const [updated] = await db
		.update(customField)
		.set(updates)
		.where(eq(customField.id, fieldId))
		.returning();

	return json(updated);
});

export const DELETE = withProjectRole(['PROJECT_ADMIN'], async ({ params, projectId }) => {
	const fieldId = Number(params.fieldId);
	if (isNaN(fieldId)) error(400, 'Invalid field ID');

	const existing = await db.query.customField.findFirst({
		where: and(eq(customField.id, fieldId), eq(customField.projectId, projectId))
	});
	if (!existing) error(404, 'Custom field not found');

	await db.delete(customField).where(eq(customField.id, fieldId));

	return json({ success: true });
});
