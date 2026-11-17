<script lang="ts">
	import type { HTMLTableAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLTableAttributes> = $props();
</script>

<div
	data-slot="table-container"
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
