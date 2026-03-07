import { json } from '@sveltejs/kit';
import { badRequest } from '$lib/server/errors';
import { db } from '$lib/server/db';
import { testCaseGroup } from '$lib/server/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { parseJsonBody } from '$lib/server/auth-utils';
import { withProjectRole } from '$lib/server/api-handler';

export const PUT = withProjectRole(['PROJECT_ADMIN', 'QA', 'DEV'], async ({ request, projectId }) => {

	const body = await parseJsonBody(request);
	const { groups } = body as { groups: { id: number; sortOrder: number }[] };

	if (!Array.isArray(groups)) {
		return badRequest('groups array is required');
	}

	for (const g of groups) {
		if (!Number.isInteger(g.sortOrder) || g.sortOrder < 0) {
			return badRequest('sortOrder must be a non-negative integer');
		}
	}

	// Validate all groups belong to the project
	const groupIds = groups.map((g) => g.id);
	if (groupIds.length > 0) {
		const existingGroups = await db
			.select({ id: testCaseGroup.id })
			.from(testCaseGroup)
			.where(and(inArray(testCaseGroup.id, groupIds), eq(testCaseGroup.projectId, projectId)));
		if (existingGroups.length !== groupIds.length) {
			return badRequest('Some groups do not belong to this project');
		}
	}

	await db.transaction(async (tx) => {
		for (const g of groups) {
			await tx
				.update(testCaseGroup)
				.set({ sortOrder: g.sortOrder })
				.where(and(eq(testCaseGroup.id, g.id), eq(testCaseGroup.projectId, projectId)));
		}
	});

	return json({ success: true });
});
