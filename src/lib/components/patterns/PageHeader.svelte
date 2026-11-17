<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		title,
		description,
		actions,
		level = 2
	}: {
		title: string;
		description?: string;
		actions?: Snippet;
		level?: 1 | 2;
	} = $props();
</script>

<header
	data-slot="page-header"
	class="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
>
	<div class="min-w-0 space-y-1">
		<svelte:element
			this={level === 1 ? 'h1' : 'h2'}
			class="text-2xl font-semibold tracking-tight [overflow-wrap:anywhere]">{title}</svelte:element
		>
		{#if description}<p class="max-w-prose text-sm leading-relaxed text-muted-foreground">
				{description}
			</p>{/if}
	</div>
	{#if actions}<div
			class="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto sm:justify-end"
		>
			{@render actions()}
		</div>{/if}
</header>
