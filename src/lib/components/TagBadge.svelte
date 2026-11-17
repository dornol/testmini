<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	let { name, color, onremove }: { name: string; color: string; onremove?: () => void } = $props();
</script>

<span
	class="inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium"
>
	<span class="h-2 w-2 shrink-0 rounded-full" style="background-color: {color}"></span>
	<span class="min-w-0 truncate">{name}</span>
	{#if onremove}
		<button
			type="button"
			aria-label={`${m.aria_remove()} ${name}`}
			class="text-muted-foreground hover:text-foreground ml-0.5 inline-flex min-h-6 min-w-6 items-center justify-center shrink-0"
			onclick={onremove}
		>
			&times;
		</button>
	{/if}
</span>
