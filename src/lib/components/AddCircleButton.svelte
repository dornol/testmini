<script lang="ts">
	let { tip = '', size = 'md', onclick }: {
		tip?: string;
		size?: 'sm' | 'md';
		onclick?: (e: MouseEvent) => void;
	} = $props();

	const sizes = {
		sm: 'h-5 w-5',
		md: 'h-6 w-6'
	} as const;
	const iconSizes = { sm: 12, md: 14 } as const;
</script>

{#if onclick}
	<button
		type="button"
		class="text-muted-foreground/50 hover:text-primary hover:bg-primary/10 cursor-pointer rounded-full {sizes[size]} inline-flex items-center justify-center transition-colors"
		data-tip={tip || undefined}
		{onclick}
	>
		<svg xmlns="http://www.w3.org/2000/svg" width={iconSizes[size]} height={iconSizes[size]} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/></svg>
	</button>
{:else}
	<span
		class="text-muted-foreground/50 hover:text-primary cursor-pointer rounded-full {sizes[size]} inline-flex items-center justify-center transition-colors"
		data-tip={tip || undefined}
	>
		<svg xmlns="http://www.w3.org/2000/svg" width={iconSizes[size]} height={iconSizes[size]} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/></svg>
	</span>
{/if}
