import { render } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChartConfiguration } from 'chart.js';

const created: Array<{ config: unknown; destroy: ReturnType<typeof vi.fn> }> = [];
vi.mock('$lib/chart-setup', async () => {
	return {
		Chart: class {
			destroy = vi.fn();
			constructor(_canvas: unknown, config: unknown) {
				created.push({ config, destroy: this.destroy });
			}
		}
	};
});

const config = (label: string) =>
	({ type: 'bar', data: { labels: [label], datasets: [] } }) as ChartConfiguration;

beforeEach(() => {
	created.length = 0;
});

describe('Chart', () => {
	it('draws the chart once chart.js has loaded and destroys it on unmount', async () => {
		const { default: Chart } = await import('../Chart.svelte');
		const { unmount } = render(Chart, { config: config('a'), 'aria-label': 'Sales' });

		await vi.waitFor(() => expect(created).toHaveLength(1));
		expect(created[0].config).toEqual(config('a'));

		unmount();
		expect(created[0].destroy).toHaveBeenCalledTimes(1);
	});

	it('exposes the canvas as an image only when it has a label', async () => {
		const { default: Chart } = await import('../Chart.svelte');
		const { container, rerender } = render(Chart, { config: config('a'), 'aria-label': 'Sales' });
		expect(container.querySelector('canvas')?.getAttribute('role')).toBe('img');
		expect(container.querySelector('canvas')?.getAttribute('aria-label')).toBe('Sales');
		await rerender({ config: config('a'), 'aria-label': undefined });
		expect(container.querySelector('canvas')?.hasAttribute('role')).toBe(false);
	});

	it('replaces the chart when the config changes', async () => {
		const { default: Chart } = await import('../Chart.svelte');
		const { rerender } = render(Chart, { config: config('a') });
		await vi.waitFor(() => expect(created).toHaveLength(1));

		await rerender({ config: config('b') });
		await vi.waitFor(() => expect(created).toHaveLength(2));
		expect(created[0].destroy).toHaveBeenCalledTimes(1);
		expect(created[1].config).toEqual(config('b'));
		expect(created[1].destroy).not.toHaveBeenCalled();
	});

	it('never draws when the component is gone before chart.js arrives', async () => {
		const { default: Chart } = await import('../Chart.svelte');
		const { unmount } = render(Chart, { config: config('a') });

		// The dynamic import is still pending here, so the effect has not drawn anything yet.
		unmount();
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(created).toHaveLength(0);
	});
});
