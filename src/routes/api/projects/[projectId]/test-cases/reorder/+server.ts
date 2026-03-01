import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { testCase } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireAuth, requireProjectRole } from '$lib/server/auth-utils';

export const PUT: RequestHandler = async ({ params, request, locals }) => {
	const authUser = requireAuth(locals);
	const projectId = Number(params.projectId);
	await requireProjectRole(authUser, projectId, ['PROJECT_ADMIN', 'QA', 'DEV']);

	const body = await request.json();
	const { items } = body as {
		items: { id: number; groupId: number | null; sortOrder: number }[];
	};

	if (!Array.isArray(items)) {
		return json({ error: 'items array is required' }, { status: 400 });
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
