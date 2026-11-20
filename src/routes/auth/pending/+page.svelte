<script lang="ts">
	import { authClient } from '$lib/auth-client';
	import { goto, invalidateAll } from '$app/navigation';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as m from '$lib/paraglide/messages.js';

	let { data } = $props();
	let checking = $state(false);
	let loggingOut = $state(false);
	let notice = $state<{ kind: 'status' | 'error'; text: string } | null>(null);

	async function checkStatus() {
		if (checking) return;
		checking = true;
		notice = null;
		try {
			// An approved user is redirected by the load function.
			await invalidateAll();
			notice = { kind: 'status', text: m.pending_still() };
		} catch {
			notice = { kind: 'error', text: m.pending_check_failed() };
		} finally {
			checking = false;
		}
	}

	async function handleLogout() {
		if (loggingOut) return;
		loggingOut = true;
		notice = null;
		try {
			await authClient.signOut();
			await invalidateAll();
			await goto('/auth/login');
		} catch {
			notice = { kind: 'error', text: m.pending_logout_failed() };
		} finally {
			loggingOut = false;
		}
	}
</script>

<Card.Root>
	<Card.Header class="text-center">
		<div
			class="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900"
			aria-hidden="true"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="24"
				height="24"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				class="text-amber-600 dark:text-amber-400"
			>
				<circle cx="12" cy="12" r="10" />
				<line x1="12" y1="8" x2="12" y2="12" />
				<line x1="12" y1="16" x2="12.01" y2="16" />
			</svg>
		</div>
		<Card.Title class="text-xl" role="heading" aria-level={1}>{m.pending_title()}</Card.Title>
		<Card.Description>{m.pending_desc()}</Card.Description>
	</Card.Header>
	<Card.Content class="space-y-4">
		<div class="min-w-0 rounded-md border p-3 text-sm">
			<p class="font-medium [overflow-wrap:anywhere]">{data.userName}</p>
			<p class="text-muted-foreground [overflow-wrap:anywhere]">{data.userEmail}</p>
		</div>
		<!-- Keep the status region mounted so the result of a check is announced. -->
		<p role="status" class="text-sm text-muted-foreground empty:hidden">
			{notice?.kind === 'status' ? notice.text : ''}
		</p>
		{#if notice?.kind === 'error'}
			<p role="alert" class="text-sm text-destructive">{notice.text}</p>
		{/if}
		<div class="flex flex-col gap-2">
			<Button class="min-h-10" variant="outline" onclick={checkStatus} disabled={checking}>
				{checking ? m.common_loading() : m.pending_check_status()}
			</Button>
			<Button class="min-h-10" variant="ghost" onclick={handleLogout} disabled={loggingOut}>
				{m.common_logout()}
			</Button>
		</div>
	</Card.Content>
</Card.Root>
