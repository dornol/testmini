import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { dashboardLayout } from '$lib/server/db/schema';
import type { WidgetConfig } from '$lib/server/db/schema';
import { and, eq } from 'drizzle-orm';
import { withProjectAccess } from '$lib/server/api-handler';
import {
	MAX_LAYOUT_ITEMS,
	reconcileDashboardLayout,
	validateWidgetConfig
} from '$lib/server/dashboard-layout';
import { parseJsonBody } from '$lib/server/auth-utils';
import { isPlainRecord } from '$lib/server/object-validation';

function validateRequestBody(body: unknown): Record<string, unknown> {
	if (!isPlainRecord(body)) {
		error(400, 'Invalid request body');
	}
	return body;
}

export const GET = withProjectAccess(async ({ user, projectId }) => {
	const row = await db.query.dashboardLayout.findFirst({
		where: and(eq(dashboardLayout.userId, user.id), eq(dashboardLayout.projectId, projectId))
	});

	return json({ layout: reconcileDashboardLayout(row?.layout) });
});

export const PUT = withProjectAccess(async ({ request, user, projectId }) => {
	const body = validateRequestBody(await parseJsonBody(request));

	const { layout } = body;

	if (!Array.isArray(layout)) {
		error(400, 'layout must be an array');
	}
	if (layout.length > MAX_LAYOUT_ITEMS) {
		error(400, 'layout contains too many widgets');
	}

	// Validate each widget config
	const seenIds = new Set<string>();
	const validatedLayout: WidgetConfig[] = [];
	for (const item of layout) {
		const widget = validateWidgetConfig(item);
		if (!widget) {
			error(400, 'Invalid widget config in layout');
		}
		if (seenIds.has(widget.id)) {
			error(400, `Duplicate widget id: ${widget.id}`);
		}
		seenIds.add(widget.id);
		validatedLayout.push(widget);
	}

	await db
		.insert(dashboardLayout)
		.values({
			userId: user.id,
			projectId,
			layout: validatedLayout,
			updatedAt: new Date()
		})
		.onConflictDoUpdate({
			target: [dashboardLayout.userId, dashboardLayout.projectId],
			set: {
				layout: validatedLayout,
				updatedAt: new Date()
			}
		});

	return json({ layout: validatedLayout });
});
