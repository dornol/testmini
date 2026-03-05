<script lang="ts">
	import Chart from '$lib/components/Chart.svelte';
	import type { ChartConfiguration } from 'chart.js';
	import type { Attachment } from 'svelte/attachments';

	let {
		config,
		'aria-label': ariaLabel,
		height = 'h-48',
		class: className = ''
	}: {
		config: ChartConfiguration;
		'aria-label'?: string;
		height?: string;
		class?: string;
	} = $props();

	let visible = $state(false);

	const lazyReveal: Attachment = (node) => {
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						visible = true;
						observer.disconnect();
					}
				}
			},
			{ rootMargin: '100px' }
		);

		observer.observe(node);

		return () => {
			observer.disconnect();
		};
	};
</script>

<div {@attach lazyReveal} class={className}>
	{#if visible}
		<Chart {config} aria-label={ariaLabel} />
	{:else}
		<div class="bg-muted animate-pulse rounded-md {height} w-full"></div>
	{/if}
</div>
