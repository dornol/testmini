import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { customField } from '$lib/server/db/schema';
import { eq, asc } from 'drizzle-orm';
import { withProjectAccess, withProjectRole } from '$lib/server/api-handler';

export const GET = withProjectAccess(async ({ projectId }) => {
	const fields = await db
		.select()
		.from(customField)
		.where(eq(customField.projectId, projectId))
		.orderBy(asc(customField.sortOrder), asc(customField.id));

	return json(fields);
});

const VALID_TYPES = ['TEXT', 'NUMBER', 'SELECT', 'MULTISELECT', 'DATE', 'CHECKBOX', 'URL'];

export const POST = withProjectRole(['PROJECT_ADMIN'], async ({ request, user, projectId }) => {
	const body = await request.json();
	const { name, fieldType, options, required } = body as {
		name?: string;
		fieldType?: string;
		options?: string[];
		required?: boolean;
	};

	if (!name || typeof name !== 'string' || name.trim().length === 0) {
		error(400, 'Name is required');
	}
	if (!fieldType || !VALID_TYPES.includes(fieldType)) {
		error(400, `Invalid field type. Must be one of: ${VALID_TYPES.join(', ')}`);
	}
	if ((fieldType === 'SELECT' || fieldType === 'MULTISELECT') && (!Array.isArray(options) || options.length === 0)) {
		error(400, 'Options are required for SELECT/MULTISELECT fields');
	}

	const maxOrder = await db
		.select({ max: customField.sortOrder })
		.from(customField)
		.where(eq(customField.projectId, projectId));

	const [inserted] = await db
		.insert(customField)
		.values({
			projectId,
			name: name.trim(),
			fieldType,
			options: options ?? null,
			required: required ?? false,
			sortOrder: (maxOrder[0]?.max ?? 0) + 1,
			createdBy: user.id
		})
		.returning();

	return json(inserted, { status: 201 });
});
