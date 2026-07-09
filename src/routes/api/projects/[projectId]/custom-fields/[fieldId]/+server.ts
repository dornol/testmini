import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { customField } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { withProjectRole } from '$lib/server/api-handler';
import { parseJsonBody, parseId } from '$lib/server/auth-utils';
import { validateUpdateCustomFieldInput } from '$lib/server/custom-field-validation';

export const PATCH = withProjectRole(['PROJECT_ADMIN'], async ({ params, request, projectId }) => {
	const fieldId = parseId(params.fieldId, 'field ID');

	const fieldOrError = validateUpdateCustomFieldInput(await parseJsonBody(request));
	if (fieldOrError instanceof Response) return fieldOrError;

	const existing = await db.query.customField.findFirst({
		where: and(eq(customField.id, fieldId), eq(customField.projectId, projectId))
	});
	if (!existing) error(404, 'Custom field not found');

	const updates: Record<string, unknown> = {};
	if (fieldOrError.name !== undefined) updates.name = fieldOrError.name;
	if (fieldOrError.options !== undefined) updates.options = fieldOrError.options;
	if (fieldOrError.required !== undefined) updates.required = fieldOrError.required;
	if (fieldOrError.sortOrder !== undefined) updates.sortOrder = fieldOrError.sortOrder;

	if (Object.keys(updates).length === 0) {
		return json(existing);
	}

	const [updated] = await db
		.update(customField)
		.set(updates)
		.where(and(eq(customField.id, fieldId), eq(customField.projectId, projectId)))
		.returning();

	if (!updated) error(404, 'Custom field not found');

	return json(updated);
});

export const DELETE = withProjectRole(['PROJECT_ADMIN'], async ({ params, projectId }) => {
	const fieldId = parseId(params.fieldId, 'field ID');

	const existing = await db.query.customField.findFirst({
		where: and(eq(customField.id, fieldId), eq(customField.projectId, projectId))
	});
	if (!existing) error(404, 'Custom field not found');

	const [deleted] = await db
		.delete(customField)
		.where(and(eq(customField.id, fieldId), eq(customField.projectId, projectId)))
		.returning({ id: customField.id });
	if (!deleted) error(404, 'Custom field not found');

	return json({ success: true });
});
