<script lang="ts">
	import { page } from '$app/state';
	import { invalidateAll } from '$app/navigation';
	let retrying = $state(false);
	async function retry() {
		retrying = true;
		try {
			await invalidateAll();
		} finally {
			retrying = false;
		}
	}
	import { Button } from '$lib/components/ui/button/index.js';
	import * as m from '$lib/paraglide/messages.js';

	// The server's messages are English and technical ("Release not found"), so common
	// statuses get a message in the user's language. Other statuses keep the server text.
	const message = $derived.by(() => {
		switch (page.status) {
			case 400:
				return m.error_bad_request();
			case 403:
				return m.error_forbidden();
			case 404:
				return m.error_not_found();
			default:
				return page.status >= 500
					? m.error_something_went_wrong()
					: (page.error?.message ?? m.error_something_went_wrong());
		}
	});
</script>

<div class="flex min-h-[60dvh] flex-col items-center justify-center gap-4 px-4 text-center">
	<h1 class="text-6xl font-bold text-muted-foreground">{page.status}</h1>
	<p class="max-w-full break-words text-lg text-muted-foreground">
		{message}
	</p>
	<div class="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
		{#if page.status >= 500}<Button onclick={retry} disabled={retrying}
				>{retrying ? m.common_loading() : m.ui_try_again()}</Button
			>{/if}
		<Button href="/" variant="outline">{m.error_go_home()}</Button>
	</div>
</div>
