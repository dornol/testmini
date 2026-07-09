import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { customField } from '$lib/server/db/schema';
import { eq, asc } from 'drizzle-orm';
import { withProjectAccess, withProjectRole } from '$lib/server/api-handler';
import { parseJsonBody } from '$lib/server/auth-utils';
import { validateCreateCustomFieldInput } from '$lib/server/custom-field-validation';

export const GET = withProjectAccess(async ({ projectId }) => {
	const fields = await db
		.select()
		.from(customField)
		.where(eq(customField.projectId, projectId))
		.orderBy(asc(customField.sortOrder), asc(customField.id));

	return json(fields);
});

export const POST = withProjectRole(['PROJECT_ADMIN'], async ({ request, user, projectId }) => {
	const fieldOrError = validateCreateCustomFieldInput(await parseJsonBody(request));
	if (fieldOrError instanceof Response) return fieldOrError;

	const maxOrder = await db
		.select({ max: customField.sortOrder })
		.from(customField)
		.where(eq(customField.projectId, projectId));

	const [inserted] = await db
		.insert(customField)
		.values({
			projectId,
			name: fieldOrError.name,
			fieldType: fieldOrError.fieldType,
			options: fieldOrError.options ?? null,
			required: fieldOrError.required ?? false,
			sortOrder: (maxOrder[0]?.max ?? 0) + 1,
			createdBy: user.id
		})
		.returning();

	return json(inserted, { status: 201 });
});
