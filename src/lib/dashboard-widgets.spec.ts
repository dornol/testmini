import { describe, it, expect } from 'vitest';
import { WIDGET_DEFINITIONS, DEFAULT_LAYOUT, SIZE_COLS } from './dashboard-widgets';

describe('WIDGET_DEFINITIONS', () => {
	it('has expected number of widgets', () => {
		expect(WIDGET_DEFINITIONS).toHaveLength(6);
	});

	it('each widget has id, label, description, defaultSize', () => {
		for (const w of WIDGET_DEFINITIONS) {
			expect(w).toHaveProperty('id');
			expect(w).toHaveProperty('label');
			expect(w).toHaveProperty('description');
			expect(w).toHaveProperty('defaultSize');
			expect(typeof w.id).toBe('string');
			expect(typeof w.label).toBe('string');
			expect(typeof w.description).toBe('string');
			expect(['sm', 'md', 'lg']).toContain(w.defaultSize);
		}
	});

	it('all IDs are unique', () => {
		const ids = WIDGET_DEFINITIONS.map((w) => w.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('known widget IDs exist', () => {
		const ids = WIDGET_DEFINITIONS.map((w) => w.id);
		const expected = [
			'stats_summary',
			'pass_rate_trend',
			'status_distribution',
			'recent_runs',
			'priority_breakdown',
			'top_failing'
		];
		for (const id of expected) {
			expect(ids).toContain(id);
		}
	});
});

describe('DEFAULT_LAYOUT', () => {
	it('has same length as WIDGET_DEFINITIONS', () => {
		expect(DEFAULT_LAYOUT).toHaveLength(WIDGET_DEFINITIONS.length);
	});

	it('each entry has id, size, visible, order', () => {
		for (const entry of DEFAULT_LAYOUT) {
			expect(entry).toHaveProperty('id');
			expect(entry).toHaveProperty('size');
			expect(entry).toHaveProperty('visible');
			expect(entry).toHaveProperty('order');
		}
	});

	it('all IDs from WIDGET_DEFINITIONS are represented', () => {
		const layoutIds = DEFAULT_LAYOUT.map((e) => e.id);
		for (const w of WIDGET_DEFINITIONS) {
			expect(layoutIds).toContain(w.id);
		}
	});

	it('orders are sequential (0, 1, 2, ...)', () => {
		const orders = DEFAULT_LAYOUT.map((e) => e.order);
		expect(orders).toEqual(WIDGET_DEFINITIONS.map((_, i) => i));
	});

	it('default visibility is true for all widgets', () => {
		for (const entry of DEFAULT_LAYOUT) {
			expect(entry.visible).toBe(true);
		}
	});

	it('default size matches WIDGET_DEFINITIONS defaults', () => {
		for (const entry of DEFAULT_LAYOUT) {
			const def = WIDGET_DEFINITIONS.find((w) => w.id === entry.id);
			expect(def).toBeDefined();
			expect(entry.size).toBe(def!.defaultSize);
		}
	});
});

describe('SIZE_COLS', () => {
	it("has entries for 'sm', 'md', 'lg'", () => {
		expect(SIZE_COLS).toHaveProperty('sm');
		expect(SIZE_COLS).toHaveProperty('md');
		expect(SIZE_COLS).toHaveProperty('lg');
	});

	it("'sm' maps to 'col-span-1'", () => {
		expect(SIZE_COLS.sm).toBe('col-span-1');
	});

	it("'md' includes 'md:col-span-2' for responsive behavior", () => {
		expect(SIZE_COLS.md).toContain('md:col-span-2');
	});

	it("'lg' includes 'lg:col-span-3' for responsive behavior", () => {
		expect(SIZE_COLS.lg).toContain('lg:col-span-3');
	});

	it('all values are non-empty strings', () => {
		for (const value of Object.values(SIZE_COLS)) {
			expect(typeof value).toBe('string');
			expect(value.length).toBeGreaterThan(0);
		}
	});
});
