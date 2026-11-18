<script lang="ts">
	import { Label } from '$lib/components/ui/label';
	import type { Snippet } from 'svelte';
	import * as m from '$lib/paraglide/messages.js';

	let {
		id,
		label,
		required = false,
		error,
		children
	}: {
		id: string;
		label: string;
		required?: boolean;
		error: string;
		children: Snippet<
			[{ id: string; required: boolean; 'aria-invalid': boolean; 'aria-describedby'?: string }]
		>;
	} = $props();
</script>

<div class="space-y-2">
	<Label for={id}>
		{label}
		{#if required}<span class="text-xs text-muted-foreground">({m.ui_required()})</span>{/if}
	</Label>
	{@render children({
		id,
		required,
		'aria-invalid': !!error,
		'aria-describedby': error ? id + '-error' : undefined
	})}
	{#if error}<p id={id + '-error'} class="text-sm text-destructive">{error}</p>{/if}
</div>
