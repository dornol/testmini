import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { customField } from '$lib/server/db/schema';
import { eq, asc } from 'drizzle-orm';
import { parseId } from '$lib/server/auth-utils';

export const load: PageServerLoad = async ({ parent, params }) => {
	await parent();
	const projectId = parseId(params.projectId, 'project ID');

	const fields = await db
		.select()
		.from(customField)
		.where(eq(customField.projectId, projectId))
		.orderBy(asc(customField.sortOrder), asc(customField.id));

	return { customFields: fields };
};
