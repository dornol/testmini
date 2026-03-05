<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button/index.js';
	import { toast } from 'svelte-sonner';
	import * as m from '$lib/paraglide/messages.js';

	interface Props {
		selectedPending: Set<number>;
		onresult: () => void;
	}

	let { selectedPending, onresult }: Props = $props();
	let submitting = $state(false);

	function handleResult() {
		submitting = true;
		const count = selectedPending.size;
		return async ({
			result,
			update
		}: {
			result: { type: string; data?: Record<string, unknown> };
			update: () => Promise<void>;
		}) => {
			submitting = false;
			if (result.type === 'success') {
				toast.success(m.bulk_pass_success({ count }));
				onresult();
			} else if (result.type === 'failure') {
				toast.error(m.bulk_pass_error());
				await update();
			}
		};
	}
</script>

{#if selectedPending.size > 0}
	<div class="bg-muted flex items-center gap-3 rounded-lg p-3">
		<span class="text-sm font-medium"
			>{m.run_pending_selected({ count: selectedPending.size })}</span
		>
		<form method="POST" action="?/bulkPass" use:enhance={handleResult}>
			{#each [...selectedPending] as id (id)}
				<input type="hidden" name="executionIds" value={id} />
			{/each}
			<Button type="submit" size="sm" variant="outline" disabled={submitting}>
				{#if submitting}
					<svg class="mr-1 h-3 w-3 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
				{/if}
				{m.run_bulk_pass()}
			</Button>
		</form>
	</div>
{/if}
