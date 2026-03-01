<script lang="ts">
	let { name, color, onremove }: { name: string; color: string; onremove?: () => void } = $props();
</script>

<span
	class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium"
>
	<span class="h-2 w-2 rounded-full" style="background-color: {color}"></span>
	{name}
	{#if onremove}
		<button
			type="button"
			class="text-muted-foreground hover:text-foreground ml-0.5"
			onclick={onremove}
		>
			&times;
		</button>
	{/if}
</span>
