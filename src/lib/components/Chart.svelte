<script lang="ts">
	import type { Chart, ChartConfiguration } from 'chart.js';

	let { config, 'aria-label': ariaLabel }: { config: ChartConfiguration; 'aria-label'?: string } =
		$props();

	let canvas: HTMLCanvasElement;

	$effect(() => {
		const cfg = config;
		let chart: Chart | undefined;
		let cancelled = false;

		// chart.js is about 60 KiB gzipped, so it is fetched when a chart is drawn, not with the page.
		import('$lib/chart-setup').then(({ Chart }) => {
			if (!cancelled) chart = new Chart(canvas, cfg);
		});

		return () => {
			cancelled = true;
			chart?.destroy();
		};
	});
</script>

<canvas bind:this={canvas} aria-label={ariaLabel} role={ariaLabel ? 'img' : undefined}></canvas>
