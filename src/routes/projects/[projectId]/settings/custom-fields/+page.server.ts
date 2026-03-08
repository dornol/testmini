import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { customField } from '$lib/server/db/schema';
import { eq, asc } from 'drizzle-orm';

export const load: PageServerLoad = async ({ parent, params }) => {
	await parent();
	const projectId = Number(params.projectId);

	const fields = await db
		.select()
		.from(customField)
		.where(eq(customField.projectId, projectId))
		.orderBy(asc(customField.sortOrder), asc(customField.id));

	return { customFields: fields };
};
