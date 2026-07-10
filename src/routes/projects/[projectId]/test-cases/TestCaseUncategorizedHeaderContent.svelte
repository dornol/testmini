<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';

	let {
		collapsed,
		count,
		onToggle
	}: {
		collapsed: boolean;
		count: number;
		onToggle: () => void;
	} = $props();
</script>

<button
	type="button"
	class="text-muted-foreground hover:text-foreground transition-colors"
	onclick={onToggle}
>
	{#if collapsed}
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="14"
			height="14"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"><polyline points="9 18 15 12 9 6" /></svg
		>
	{:else}
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="14"
			height="14"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"><polyline points="6 9 12 15 18 9" /></svg
		>
	{/if}
</button>
<span class="text-muted-foreground">{m.group_uncategorized()}</span>
<span class="text-xs text-muted-foreground font-normal">({count})</span>
