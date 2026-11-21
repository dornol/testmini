<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import { Button } from '$lib/components/ui/button/index.js';
	import LinkedAccounts from '$lib/components/LinkedAccounts.svelte';

	let { data } = $props();
</script>

<Button variant="ghost" size="sm" class="mb-2 min-h-10 -ms-2" href="/projects">
	<ArrowLeftIcon class="size-4" aria-hidden="true" />
	{m.auth_account_back()}
</Button>

<LinkedAccounts
	linkedAccounts={data.linkedAccounts}
	availableProviders={data.availableProviders}
	hasPassword={data.hasPassword}
	title={m.oidc_linked_accounts()}
	level={1}
/>
