<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import PageHeader from '$lib/components/patterns/PageHeader.svelte';
	import NameDescriptionForm from '$lib/components/NameDescriptionForm.svelte';

	let { data, form } = $props();
</script>

<div class="mx-auto max-w-lg space-y-4">
	<a
		href="/teams"
		class="text-muted-foreground hover:text-foreground inline-flex min-h-8 items-center rounded-sm text-sm focus-visible:outline-2 focus-visible:outline-ring"
		>&larr; {m.common_back_to({ target: m.nav_teams() })}</a
	>
	<PageHeader title={m.team_new()} description={m.team_empty_create()} level={1} />
	<NameDescriptionForm initial={form?.form ?? data.form} team />
</div>
