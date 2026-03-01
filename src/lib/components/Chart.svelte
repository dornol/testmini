<script lang="ts">
	import { Chart, registerables, type ChartConfiguration } from 'chart.js';

	Chart.register(...registerables);

	let { config }: { config: ChartConfiguration } = $props();

	let canvas: HTMLCanvasElement;
	let chart: Chart | undefined;

	$effect(() => {
		const cloned = structuredClone(config);
		if (chart) {
			chart.destroy();
		}
		chart = new Chart(canvas, cloned);

		return () => {
			chart?.destroy();
			chart = undefined;
		};
	});
</script>

<canvas bind:this={canvas}></canvas>
