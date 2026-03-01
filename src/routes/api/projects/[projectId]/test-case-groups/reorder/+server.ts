import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { testCaseGroup } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireAuth, requireProjectRole } from '$lib/server/auth-utils';

export const PUT: RequestHandler = async ({ params, request, locals }) => {
	const authUser = requireAuth(locals);
	const projectId = Number(params.projectId);
	await requireProjectRole(authUser, projectId, ['PROJECT_ADMIN', 'QA', 'DEV']);

	const body = await request.json();
	const { groups } = body as { groups: { id: number; sortOrder: number }[] };

	if (!Array.isArray(groups)) {
		return json({ error: 'groups array is required' }, { status: 400 });
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
};
