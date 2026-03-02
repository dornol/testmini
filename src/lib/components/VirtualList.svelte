<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		items: unknown[];
		rowHeight?: number;
		overscan?: number;
		height?: string;
		useWindowScroll?: boolean;
		children: Snippet<[{ item: unknown; index: number }]>;
	}

	let {
		items,
		rowHeight = 44,
		overscan = 10,
		height = '420px',
		useWindowScroll = false,
		children
	}: Props = $props();

	let container: HTMLDivElement | undefined = $state();
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

	function updateWindowScroll() {
		if (!container) return;
		const rect = container.getBoundingClientRect();
		viewportHeight = window.innerHeight;
		scrollTop = Math.max(0, -rect.top);
	}

	$effect(() => {
		if (!container) return;
		if (useWindowScroll) {
			updateWindowScroll();
			window.addEventListener('scroll', updateWindowScroll, { passive: true });
			window.addEventListener('resize', updateWindowScroll, { passive: true });
			return () => {
				window.removeEventListener('scroll', updateWindowScroll);
				window.removeEventListener('resize', updateWindowScroll);
			};
		} else {
			viewportHeight = container.clientHeight;
		}
	});
</script>

<div
	bind:this={container}
	class={useWindowScroll ? '' : 'overflow-auto'}
	style={useWindowScroll ? '' : `height: ${height};`}
	onscroll={useWindowScroll ? undefined : handleScroll}
>
	<div style="height: {topSpacer}px;"></div>
	{#each visibleItems as item, i (startIndex + i)}
		{@render children({ item, index: startIndex + i })}
	{/each}
	<div style="height: {bottomSpacer}px;"></div>
</div>
