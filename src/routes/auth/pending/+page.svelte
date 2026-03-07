<script lang="ts">
	import { authClient } from '$lib/auth-client';
	import { goto, invalidateAll } from '$app/navigation';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as m from '$lib/paraglide/messages.js';

	let { data } = $props();
	let checking = $state(false);

	async function checkStatus() {
		checking = true;
		await invalidateAll();
		checking = false;
	}

	async function handleLogout() {
		await authClient.signOut();
		await invalidateAll();
		goto('/auth/login');
	}
</script>

<Card.Root>
	<Card.Header class="text-center">
		<div class="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900">
			<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-amber-600 dark:text-amber-400">
				<circle cx="12" cy="12" r="10" />
				<line x1="12" y1="8" x2="12" y2="12" />
				<line x1="12" y1="16" x2="12.01" y2="16" />
			</svg>
		</div>
		<Card.Title class="text-xl">{m.pending_title()}</Card.Title>
		<Card.Description>{m.pending_desc()}</Card.Description>
	</Card.Header>
	<Card.Content class="space-y-4">
		<div class="rounded-md border p-3 text-sm">
			<p class="font-medium">{data.userName}</p>
			<p class="text-muted-foreground">{data.userEmail}</p>
		</div>
		<div class="flex flex-col gap-2">
			<Button variant="outline" onclick={checkStatus} disabled={checking}>
				{checking ? m.common_loading() : m.pending_check_status()}
			</Button>
			<Button variant="ghost" onclick={handleLogout}>
				{m.common_logout()}
			</Button>
		</div>
	</Card.Content>
</Card.Root>
