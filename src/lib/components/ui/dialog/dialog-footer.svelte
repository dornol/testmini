<script lang="ts">
	import { cn, type WithElementRef } from '$lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();
</script>

<div
	bind:this={ref}
	data-slot="dialog-footer"
	class={cn(
		'flex min-w-0 flex-col-reverse gap-2 sm:flex-row sm:justify-end',
		'[&>button]:w-full sm:[&>button]:w-auto [&>form]:w-full sm:[&>form]:w-auto [&>form>button]:w-full sm:[&>form>button]:w-auto',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>
