<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils';

	let {
		children,
		label,
		class: className
	}: {
		children: Snippet;
		label: string;
		class?: string;
	} = $props();
</script>

<section
	aria-label={label}
	data-slot="filter-toolbar"
	class={cn('flex min-w-0 flex-wrap items-center gap-2 rounded-xl border bg-card p-3', className)}
>
	{@render children()}
</section>
