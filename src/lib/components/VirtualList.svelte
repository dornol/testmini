<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		items: unknown[];
		rowHeight?: number;
		overscan?: number;
		height?: string;
		children: Snippet<[{ item: unknown; index: number }]>;
	}

	let {
		items,
		rowHeight = 44,
		overscan = 10,
		height = '420px',
		children
	}: Props = $props();

	let scrollTop = $state(0);
	let viewportHeight = $state(0);

	const totalHeight = $derived(items.length * rowHeight);
	const startIndex = $derived(Math.max(0, Math.floor(scrollTop / rowHeight) - overscan));
	const endIndex = $derived(
		Math.min(items.length, Math.ceil((scrollTop + viewportHeight) / rowHeight) + overscan)
	);
	const visibleItems = $derived(items.slice(startIndex, endIndex));
	const topSpacer = $derived(startIndex * rowHeight);
	const bottomSpacer = $derived(Math.max(0, totalHeight - endIndex * rowHeight));

	function handleScroll(e: Event) {
		const target = e.currentTarget as HTMLDivElement;
		scrollTop = target.scrollTop;
		viewportHeight = target.clientHeight;
	}
</script>

<div
	class="overflow-auto"
	style="height: {height};"
	onscroll={handleScroll}
>
	<div style="height: {topSpacer}px;"></div>
	{#each visibleItems as item, i (startIndex + i)}
		{@render children({ item, index: startIndex + i })}
	{/each}
	<div style="height: {bottomSpacer}px;"></div>
</div>
