<script lang="ts">
	import type { Snippet } from 'svelte';
	import Inbox from '@lucide/svelte/icons/inbox';
	let { title, description, actions }: { title: string; description: string; actions?: Snippet } =
		$props();
</script>

<section
	data-slot="empty-state"
	class="flex min-w-0 flex-col items-center rounded-xl border border-dashed bg-card px-4 py-12 text-center sm:px-8"
>
	<div
		class="mb-4 flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground"
	>
		<Inbox class="size-6" aria-hidden="true" />
	</div>
	<h3 class="text-lg font-semibold [overflow-wrap:anywhere]">{title}</h3>
	<p
		class="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground [overflow-wrap:anywhere]"
	>
		{description}
	</p>
	{#if actions}<div class="mt-5 flex w-full flex-wrap justify-center gap-2 sm:w-auto">
			{@render actions()}
		</div>{/if}
</section>
