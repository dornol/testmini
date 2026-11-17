<script lang="ts">
	import { onMount } from 'svelte';
	import * as m from '$lib/paraglide/messages.js';
	import type { HTMLTableAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLTableAttributes> = $props();
	let container: HTMLDivElement;
	let scrollable = $state(false);
	onMount(() => {
		const update = () => {
			scrollable = container.scrollWidth > container.clientWidth;
		};
		if (typeof ResizeObserver === 'undefined') {
			update();
			window.addEventListener('resize', update);
			return () => window.removeEventListener('resize', update);
		}
		const observer = new ResizeObserver(update);
		observer.observe(container);
		if (ref) observer.observe(ref);
		update();
		return () => observer.disconnect();
	});
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex (Overflowing tables need a keyboard scroll target.) -->
<div
	data-slot="table-container"
	bind:this={container}
	tabindex={scrollable ? 0 : undefined}
	role={scrollable ? 'region' : undefined}
	aria-label={scrollable ? m.ui_scroll_table() : undefined}
	class="relative min-w-0 w-full overflow-x-auto rounded-lg border bg-card"
>
	<table
		bind:this={ref}
		data-slot="table"
		class={cn(
			'w-full caption-bottom text-sm tabular-nums [&_th:first-child]:pl-4 [&_th:last-child]:pr-4 [&_td:first-child]:pl-4 [&_td:last-child]:pr-4',
			className
		)}
		{...restProps}
	>
		{@render children?.()}
	</table>
</div>
