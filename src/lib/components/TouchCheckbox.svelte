<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';

	let {
		checked = $bindable(false),
		indeterminate = false,
		dense = false,
		class: className,
		...rest
	}: Omit<HTMLInputAttributes, 'type'> & { indeterminate?: boolean; dense?: boolean } = $props();
</script>

<!--
	A 16px box with a larger hit area that does not change the layout size:
	40px by default, 32px when `dense` so it does not overlap a neighbour in a tight row.
	The label stops clicks from reaching a clickable row behind it.
-->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<label
	class={cn(
		'flex shrink-0 cursor-pointer items-center justify-center',
		dense ? '-m-2 size-8' : '-m-3 size-10'
	)}
	onclick={(e) => e.stopPropagation()}
>
	<input
		type="checkbox"
		bind:checked
		{indeterminate}
		class={cn('size-4 rounded border-muted-foreground', className)}
		{...rest}
	/>
</label>
