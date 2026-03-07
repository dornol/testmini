import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { testCase } from '$lib/server/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { parseJsonBody } from '$lib/server/auth-utils';
import { withProjectRole } from '$lib/server/api-handler';
import { badRequest } from '$lib/server/errors';

export const PUT = withProjectRole(['PROJECT_ADMIN', 'QA', 'DEV'], async ({ request, projectId }) => {

	const body = await parseJsonBody(request);
	const { items } = body as {
		items: { id: number; groupId: number | null; sortOrder: number }[];
	};

	if (!Array.isArray(items)) {
		return badRequest('items array is required');
	}

	for (const item of items) {
		if (!Number.isInteger(item.sortOrder) || item.sortOrder < 0) {
			return badRequest('sortOrder must be a non-negative integer');
		}
	}

	// Validate all test cases belong to the project
	const itemIds = items.map((item) => item.id);
	if (itemIds.length > 0) {
		const existingItems = await db
			.select({ id: testCase.id })
			.from(testCase)
			.where(and(inArray(testCase.id, itemIds), eq(testCase.projectId, projectId)));
		if (existingItems.length !== itemIds.length) {
			return badRequest('Some test cases do not belong to this project');
		}
	}

	await db.transaction(async (tx) => {
		for (const item of items) {
			await tx
				.update(testCase)
				.set({ groupId: item.groupId, sortOrder: item.sortOrder })
				.where(and(eq(testCase.id, item.id), eq(testCase.projectId, projectId)));
		}
	});

	return json({ success: true });
});
