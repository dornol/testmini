<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as m from '$lib/paraglide/messages.js';
	let {
		options,
		value,
		onchange
	}: {
		options: { value: string; label: string }[];
		value: string;
		onchange: (value: string) => void;
	} = $props();
</script>

<div
	role="group"
	aria-label={m.ui_status_filter()}
	data-slot="status-filter"
	class="flex flex-wrap gap-2 rounded-xl border bg-card p-3"
>
	{#each options as option (option.value)}
		<Button
			size="sm"
			variant={value === option.value ? 'default' : 'outline'}
			aria-pressed={value === option.value}
			onclick={() => onchange(option.value)}>{option.label}</Button
		>
	{/each}
</div>
