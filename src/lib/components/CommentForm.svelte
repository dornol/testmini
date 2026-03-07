<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import * as m from '$lib/paraglide/messages.js';

	let {
		value = $bindable(''),
		placeholder = '',
		rows = 3,
		submitting = false,
		submitLabel = m.comment_submit(),
		cancelLabel = '',
		onsubmit,
		oncancel
	}: {
		value?: string;
		placeholder?: string;
		rows?: number;
		submitting?: boolean;
		submitLabel?: string;
		cancelLabel?: string;
		onsubmit: () => void;
		oncancel?: () => void;
	} = $props();
</script>

<div class="space-y-2">
	<Textarea
		bind:value
		{placeholder}
		{rows}
		class="text-sm"
	/>
	<div class="flex gap-2">
		<Button size="sm" disabled={submitting || !value.trim()} onclick={onsubmit}>
			{submitting ? m.common_saving() : submitLabel}
		</Button>
		{#if oncancel}
			<Button size="sm" variant="outline" onclick={oncancel}>
				{cancelLabel || m.common_cancel()}
			</Button>
		{/if}
	</div>
</div>
