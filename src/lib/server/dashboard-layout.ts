import { DEFAULT_LAYOUT } from '$lib/dashboard-widgets';
import type { WidgetConfig } from '$lib/server/db/schema';
import { isPlainRecord } from '$lib/server/object-validation';

const VALID_SIZES = new Set<string>(['sm', 'md', 'lg']);
const KNOWN_WIDGET_IDS = new Set(DEFAULT_LAYOUT.map((w) => w.id));
export const MAX_LAYOUT_ITEMS = DEFAULT_LAYOUT.length;

export function validateWidgetConfig(value: unknown): WidgetConfig | null {
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

export function reconcileDashboardLayout(value: unknown): WidgetConfig[] {
	const saved = new Map<string, WidgetConfig>();
	if (Array.isArray(value)) {
		for (const entry of value) {
			const widget = validateWidgetConfig(entry);
			if (widget && !saved.has(widget.id)) saved.set(widget.id, widget);
		}
	}
	const ordered = [...saved.values()].sort((left, right) => left.order - right.order);
	return [...ordered, ...DEFAULT_LAYOUT.filter(({ id }) => !saved.has(id))].map(
		(widget, order) => ({ ...widget, order })
	);
}
