<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';

	let { data } = $props();

	function handleResult() {
		return async ({
			result,
			update
		}: {
			result: { type: string; data?: Record<string, unknown> };
			update: () => Promise<void>;
		}) => {
			if (result.type === 'success') {
				toast.success(m.oidc_account_unlinked());
				await invalidateAll();
			} else if (result.type === 'failure') {
				toast.error((result.data?.error as string) ?? m.error_operation_failed());
				await update();
			}
		};
	}
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{m.oidc_linked_accounts()}</Card.Title>
	</Card.Header>
	<Card.Content class="space-y-4">
		{#if data.linkedAccounts.length > 0}
			<div class="space-y-3">
				{#each data.linkedAccounts as account (account.id)}
					<div class="flex items-center justify-between rounded-lg border p-3">
						<div class="flex items-center gap-3">
							{#if account.providerIconUrl}
								<img src={account.providerIconUrl} alt="" class="h-6 w-6" />
							{:else}
								<div class="bg-muted flex h-6 w-6 items-center justify-center rounded text-xs font-bold">
									{account.providerName.charAt(0).toUpperCase()}
								</div>
							{/if}
							<div>
								<p class="text-sm font-medium">{account.providerName}</p>
								<p class="text-muted-foreground text-xs">{account.email || account.externalId}</p>
							</div>
						</div>
						<form method="POST" action="?/unlink" use:enhance={handleResult}>
							<input type="hidden" name="accountId" value={account.id} />
							<Button type="submit" variant="outline" size="sm">
								{m.oidc_unlink_account()}
							</Button>
						</form>
					</div>
				{/each}
			</div>
		{:else}
			<p class="text-muted-foreground text-sm">{m.oidc_no_providers()}</p>
		{/if}

		{#if data.availableProviders.length > 0}
			<div class="space-y-2 pt-2">
				<p class="text-sm font-medium">{m.oidc_link_account()}</p>
				{#each data.availableProviders as provider (provider.slug)}
					<Button variant="outline" class="w-full" href="/auth/oidc/{provider.slug}?link=true" data-sveltekit-reload>
						{#if provider.iconUrl}
							<img src={provider.iconUrl} alt="" class="mr-2 h-4 w-4" />
						{/if}
						{m.oidc_login_with({ name: provider.name })}
					</Button>
				{/each}
			</div>
		{/if}
	</Card.Content>
</Card.Root>
