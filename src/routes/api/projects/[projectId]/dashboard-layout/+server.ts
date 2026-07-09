import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { dashboardLayout } from '$lib/server/db/schema';
import type { WidgetConfig } from '$lib/server/db/schema';
import { and, eq } from 'drizzle-orm';
import { withProjectAccess } from '$lib/server/api-handler';
import { DEFAULT_LAYOUT, WIDGET_DEFINITIONS } from '$lib/dashboard-widgets';
import { parseJsonBody } from '$lib/server/auth-utils';
import { isPlainRecord } from '$lib/server/object-validation';

const VALID_SIZES = new Set<string>(['sm', 'md', 'lg']);
const KNOWN_WIDGET_IDS = new Set(WIDGET_DEFINITIONS.map((w) => w.id));
const MAX_LAYOUT_ITEMS = WIDGET_DEFINITIONS.length;

function validateWidgetConfig(value: unknown): WidgetConfig | null {
	if (!isPlainRecord(value)) return null;
	const order = value.order;
	if (
		typeof value.id === 'string' &&
		KNOWN_WIDGET_IDS.has(value.id) &&
		typeof value.visible === 'boolean' &&
		typeof order === 'number' &&
		Number.isInteger(order) &&
		order >= 0 &&
		order < MAX_LAYOUT_ITEMS &&
		typeof value.size === 'string' &&
		VALID_SIZES.has(value.size)
	) {
		const size = value.size as WidgetConfig['size'];
		return {
			id: value.id,
			visible: value.visible,
			order,
			size
		};
	}

	return null;
}

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

	if (!row) {
		return json({ layout: DEFAULT_LAYOUT });
	}

	// Reconcile saved layout with current widget definitions:
	// add new widgets that aren't in saved layout, remove obsolete ones
	const seenSavedIds = new Set<string>();
	const saved = Array.isArray(row.layout)
		? row.layout.reduce<WidgetConfig[]>((items, item) => {
				const widget = validateWidgetConfig(item);
				if (!widget || seenSavedIds.has(widget.id)) return items;
				seenSavedIds.add(widget.id);
				items.push(widget);
				return items;
			}, [])
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
