<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button';
	import * as m from '$lib/paraglide/messages.js';

	let retrying = $state(false);
	const expired = $derived(page.status === 410);
	const temporary = $derived(page.status >= 500);
	const title = $derived(
		expired
			? m.report_shared_expired()
			: temporary
				? m.ui_load_failed()
				: m.report_shared_unavailable()
	);

	async function retry() {
		retrying = true;
		try {
			await invalidateAll();
		} finally {
			retrying = false;
		}
	}
</script>

<svelte:head><title>{title} · {m.report_shared_title()}</title></svelte:head>

<main class="mx-auto flex min-h-[70dvh] max-w-lg items-center px-4 py-8">
	<section
		class="w-full space-y-4 rounded-lg border bg-card p-5 sm:p-8"
		aria-labelledby="shared-error-title"
	>
		<h1 id="shared-error-title" class="text-2xl font-bold text-balance break-keep">{title}</h1>
		<p class="text-sm text-muted-foreground">
			{expired
				? m.report_shared_expired_hint()
				: temporary
					? m.ui_load_failed_description()
					: m.report_shared_unavailable_hint()}
		</p>
		<div class="flex flex-wrap gap-2">
			{#if temporary}
				<Button onclick={retry} disabled={retrying}
					>{retrying ? m.common_loading() : m.ui_try_again()}</Button
				>
			{/if}
			<Button href="/" variant="outline">{m.error_go_home()}</Button>
		</div>
	</section>
</main>
