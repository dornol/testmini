import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { testCase } from '$lib/server/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { requireAuth, requireProjectRole, parseJsonBody } from '$lib/server/auth-utils';

export const PUT: RequestHandler = async ({ params, request, locals }) => {
	const authUser = requireAuth(locals);
	const projectId = Number(params.projectId);
	await requireProjectRole(authUser, projectId, ['PROJECT_ADMIN', 'QA', 'DEV']);

	const body = await parseJsonBody(request);
	const { items } = body as {
		items: { id: number; groupId: number | null; sortOrder: number }[];
	};

	if (!Array.isArray(items)) {
		return json({ error: 'items array is required' }, { status: 400 });
	}

	for (const item of items) {
		if (!Number.isInteger(item.sortOrder) || item.sortOrder < 0) {
			return json({ error: 'sortOrder must be a non-negative integer' }, { status: 400 });
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
			return json({ error: 'Some test cases do not belong to this project' }, { status: 400 });
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
};
