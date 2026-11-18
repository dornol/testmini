<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import * as m from '$lib/paraglide/messages.js';
	import { Button } from '$lib/components/ui/button/index.js';
	let retrying = $state(false);
	async function retry() {
		if (retrying) return;
		retrying = true;
		try {
			await invalidateAll();
		} finally {
			retrying = false;
		}
	}
</script>

<div
	class="mx-auto flex max-w-lg flex-col items-center py-20 text-center"
	aria-labelledby="my-work-error"
>
	<h1 id="my-work-error" class="text-xl font-bold">{m.my_work_error_title()}</h1>
	<p class="text-muted-foreground mt-2 text-sm">{m.my_work_error_description()}</p>
	<Button class="mt-5" onclick={retry} aria-disabled={retrying}
		>{retrying ? m.my_work_loading() : m.my_work_retry()}</Button
	>
</div>
