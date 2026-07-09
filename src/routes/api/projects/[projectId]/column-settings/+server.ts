import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { project } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { parseJsonBody } from '$lib/server/auth-utils';
import { withProjectRole, withProjectAccess } from '$lib/server/api-handler';
import { validateColumnSettingsInput } from '$lib/server/column-settings-validation';

export const GET = withProjectAccess(async ({ projectId }) => {
	const p = await db.query.project.findFirst({
		where: eq(project.id, projectId),
		columns: { columnSettings: true }
	});

	return json({ columnSettings: p?.columnSettings ?? null });
});

export const PUT = withProjectRole(
	['PROJECT_ADMIN', 'QA', 'DEV'],
	async ({ request, projectId }) => {
		const columnSettingsOrError = validateColumnSettingsInput(await parseJsonBody(request));
		if (columnSettingsOrError instanceof Response) return columnSettingsOrError;
		const columnSettings = columnSettingsOrError;

		const [updated] = await db
			.update(project)
			.set({ columnSettings })
			.where(eq(project.id, projectId))
			.returning();

		if (!updated) error(404, 'Project not found');

		return json({ success: true });
	}
);
