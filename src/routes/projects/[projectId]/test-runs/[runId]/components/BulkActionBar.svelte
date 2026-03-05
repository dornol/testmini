<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as m from '$lib/paraglide/messages.js';

	interface Props {
		selectedPending: Set<number>;
		onresult: () => void;
	}

	let { selectedPending, onresult }: Props = $props();

	function handleResult() {
		return async ({
			result,
			update
		}: {
			result: { type: string; data?: Record<string, unknown> };
			update: () => Promise<void>;
		}) => {
			if (result.type === 'success') {
				onresult();
			} else if (result.type === 'failure') {
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
			<Button type="submit" size="sm" variant="outline">{m.run_bulk_pass()}</Button>
		</form>
	</div>
{/if}
