import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { dashboardLayout } from '$lib/server/db/schema';
import type { WidgetConfig } from '$lib/server/db/schema';
import { and, eq } from 'drizzle-orm';
import { withProjectAccess } from '$lib/server/api-handler';
import { DEFAULT_LAYOUT, WIDGET_DEFINITIONS } from '$lib/dashboard-widgets';
import { parseJsonBody } from '$lib/server/auth-utils';

export const GET = withProjectAccess(async ({ user, projectId }) => {

	const row = await db.query.dashboardLayout.findFirst({
		where: and(eq(dashboardLayout.userId, user.id), eq(dashboardLayout.projectId, projectId))
	});

	if (!row) {
		return json({ layout: DEFAULT_LAYOUT });
	}

	// Reconcile saved layout with current widget definitions:
	// add new widgets that aren't in saved layout, remove obsolete ones
	const saved = row.layout as WidgetConfig[];
	const knownIds = new Set(WIDGET_DEFINITIONS.map((w) => w.id));
	const savedIds = new Set(saved.map((w) => w.id));

	const reconciled: WidgetConfig[] = [
		// Keep saved widgets that still exist
		...saved.filter((w) => knownIds.has(w.id)),
		// Append newly added widgets not in saved layout
		...WIDGET_DEFINITIONS.filter((def) => !savedIds.has(def.id)).map((def, i) => ({
			id: def.id,
			visible: true,
			order: saved.length + i,
			size: def.defaultSize
		}))
	];

	return json({ layout: reconciled });
});

const VALID_SIZES = new Set<string>(['sm', 'md', 'lg']);

export const PUT = withProjectAccess(async ({ request, user, projectId }) => {

	let body: unknown;
	try {
		body = await parseJsonBody(request);
	} catch {
		error(400, 'Invalid JSON');
	}

	const { layout } = body as { layout?: unknown };

	if (!Array.isArray(layout)) {
		error(400, 'layout must be an array');
	}

	// Validate each widget config
	const knownIds = new Set(WIDGET_DEFINITIONS.map((w) => w.id));
	for (const item of layout) {
		if (
			typeof item !== 'object' ||
			item === null ||
			typeof item.id !== 'string' ||
			typeof item.visible !== 'boolean' ||
			typeof item.order !== 'number' ||
			!VALID_SIZES.has(item.size)
		) {
			error(400, 'Invalid widget config in layout');
		}
		if (!knownIds.has(item.id)) {
			error(400, `Unknown widget id: ${item.id}`);
		}
	}

	const validatedLayout = layout as WidgetConfig[];

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
