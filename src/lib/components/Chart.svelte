<script lang="ts">
	import { Chart, registerables, type ChartConfiguration } from 'chart.js';

	Chart.register(...registerables);

	let { config, 'aria-label': ariaLabel }: { config: ChartConfiguration; 'aria-label'?: string } = $props();

	let canvas: HTMLCanvasElement;
	let chart: Chart | undefined;

	$effect(() => {
		const cfg = config;
		if (chart) {
			chart.destroy();
		}
		chart = new Chart(canvas, cfg);

		return () => {
			chart?.destroy();
			chart = undefined;
		};
	});
</script>

<canvas bind:this={canvas} aria-label={ariaLabel} role={ariaLabel ? 'img' : undefined}></canvas>
