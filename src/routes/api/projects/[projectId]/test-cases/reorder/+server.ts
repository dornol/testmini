import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { testCase } from '$lib/server/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { parseJsonBody } from '$lib/server/auth-utils';
import { withProjectRole } from '$lib/server/api-handler';
import { badRequest } from '$lib/server/errors';
import { validateRequestBody, validateTestCaseReorderItems } from '$lib/server/reorder-validation';
import { cacheDeleteProjectAnalytics } from '$lib/server/cache';

export const PUT = withProjectRole(
	['PROJECT_ADMIN', 'QA', 'DEV'],
	async ({ request, projectId }) => {
		const bodyOrError = validateRequestBody(await parseJsonBody(request));
		if (bodyOrError instanceof Response) return bodyOrError;

		const itemsOrError = validateTestCaseReorderItems(bodyOrError.items);
		if (itemsOrError instanceof Response) return itemsOrError;
		const items = itemsOrError;

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
				const [updated] = await tx
					.update(testCase)
					.set({ groupId: item.groupId, sortOrder: item.sortOrder })
					.where(and(eq(testCase.id, item.id), eq(testCase.projectId, projectId)))
					.returning({ id: testCase.id });
				if (!updated) {
					error(404, 'Test case not found');
				}
			}
		});

		cacheDeleteProjectAnalytics(projectId);
		return json({ success: true });
	}
);
