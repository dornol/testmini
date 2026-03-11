import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { project } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { parseJsonBody } from '$lib/server/auth-utils';
import { withProjectRole, withProjectAccess } from '$lib/server/api-handler';
import { badRequest } from '$lib/server/errors';

export const GET = withProjectAccess(async ({ projectId }) => {
	const p = await db.query.project.findFirst({
		where: eq(project.id, projectId),
		columns: { columnSettings: true }
	});

	return json({ columnSettings: p?.columnSettings ?? null });
});

export const PUT = withProjectRole(['PROJECT_ADMIN', 'QA', 'DEV'], async ({ request, projectId }) => {
	const body = await parseJsonBody(request);
	const { columnSettings } = body as {
		columnSettings: { id: string; visible: boolean }[];
	};

	if (!Array.isArray(columnSettings)) {
		return badRequest('columnSettings must be an array');
	}

	for (const col of columnSettings) {
		if (typeof col.id !== 'string' || typeof col.visible !== 'boolean') {
			return badRequest('Each column must have id (string) and visible (boolean)');
		}
	}

	await db.update(project).set({ columnSettings }).where(eq(project.id, projectId));

	return json({ success: true });
});
