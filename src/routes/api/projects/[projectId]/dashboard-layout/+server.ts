import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { dashboardLayout } from '$lib/server/db/schema';
import type { WidgetConfig } from '$lib/server/db/schema';
import { and, eq } from 'drizzle-orm';
import { withProjectAccess } from '$lib/server/api-handler';
import { DEFAULT_LAYOUT, WIDGET_DEFINITIONS } from '$lib/dashboard-widgets';
import { parseJsonBody } from '$lib/server/auth-utils';

const VALID_SIZES = new Set<string>(['sm', 'md', 'lg']);
const KNOWN_WIDGET_IDS = new Set(WIDGET_DEFINITIONS.map((w) => w.id));
const MAX_LAYOUT_ITEMS = WIDGET_DEFINITIONS.length;

function isWidgetConfig(value: unknown): value is WidgetConfig {
	if (!value || typeof value !== 'object') return false;
	const item = value as Record<string, unknown>;
	const order = item.order;
	return (
		typeof item.id === 'string' &&
		KNOWN_WIDGET_IDS.has(item.id) &&
		typeof item.visible === 'boolean' &&
		typeof order === 'number' &&
		Number.isInteger(order) &&
		order >= 0 &&
		order < MAX_LAYOUT_ITEMS &&
		typeof item.size === 'string' &&
		VALID_SIZES.has(item.size)
	);
}

export const GET = withProjectAccess(async ({ user, projectId }) => {
	const row = await db.query.dashboardLayout.findFirst({
		where: and(eq(dashboardLayout.userId, user.id), eq(dashboardLayout.projectId, projectId))
	});

	if (!row) {
		return json({ layout: DEFAULT_LAYOUT });
	}

	// Reconcile saved layout with current widget definitions:
	// add new widgets that aren't in saved layout, remove obsolete ones
	const seenSavedIds = new Set<string>();
	const saved = Array.isArray(row.layout)
		? row.layout.filter((item) => {
				if (!isWidgetConfig(item) || seenSavedIds.has(item.id)) return false;
				seenSavedIds.add(item.id);
				return true;
			})
		: [];
	const savedIds = new Set(saved.map((w) => w.id));

	const reconciled: WidgetConfig[] = [
		// Keep saved widgets that still exist
		...saved,
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

export const PUT = withProjectAccess(async ({ request, user, projectId }) => {
	const body = await parseJsonBody(request);

	const { layout } = body as { layout?: unknown };

	if (!Array.isArray(layout)) {
		error(400, 'layout must be an array');
	}
	if (layout.length > MAX_LAYOUT_ITEMS) {
		error(400, 'layout contains too many widgets');
	}

	// Validate each widget config
	const seenIds = new Set<string>();
	for (const item of layout) {
		if (!isWidgetConfig(item)) {
			error(400, 'Invalid widget config in layout');
		}
		if (seenIds.has(item.id)) {
			error(400, `Duplicate widget id: ${item.id}`);
		}
		seenIds.add(item.id);
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
