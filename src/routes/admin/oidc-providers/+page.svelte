<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';

	let { data } = $props();

	let deleteDialogOpen = $state(false);
	let deleteTarget = $state<{ id: number; name: string; accountCount: number } | null>(null);

	function openDeleteDialog(provider: { id: number; name: string; accountCount: number }) {
		deleteTarget = provider;
		deleteDialogOpen = true;
	}

	function handleResult() {
		return async ({
			result,
			update
		}: {
			result: { type: string; data?: Record<string, unknown> };
			update: () => Promise<void>;
		}) => {
			if (result.type === 'success') {
				const d = result.data;
				if (d?.enabled === true) toast.success(m.oidc_provider_enabled());
				else if (d?.enabled === false) toast.success(m.oidc_provider_disabled());
				else if (d?.deleted) toast.success(m.oidc_provider_deleted());
				else if (d?.disabled) {
					toast.success(m.oidc_provider_disabled());
				} else {
					toast.success(m.admin_updated());
				}
				deleteDialogOpen = false;
				await invalidateAll();
			} else if (result.type === 'failure') {
				toast.error((result.data?.error as string) ?? m.error_operation_failed());
				await update();
			}
		};
	}
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<div>
			<h2 class="text-lg font-semibold">{m.oidc_providers_title()}</h2>
			<p class="text-muted-foreground text-sm">{m.oidc_providers_desc()}</p>
		</div>
		<Button href="/admin/oidc-providers/new">{m.oidc_add_provider()}</Button>
	</div>

	<Card.Root>
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head>{m.common_name()}</Table.Head>
					<Table.Head class="w-24">{m.oidc_type()}</Table.Head>
					<Table.Head class="w-36">{m.oidc_slug()}</Table.Head>
					<Table.Head class="w-24">{m.oidc_enabled()}</Table.Head>
					<Table.Head class="w-24">{m.common_status()}</Table.Head>
					<Table.Head class="w-32">{m.common_actions()}</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each data.providers as provider (provider.id)}
					<Table.Row>
						<Table.Cell>
							<a href="/admin/oidc-providers/{provider.id}" class="font-medium hover:underline">
								{provider.name}
							</a>
						</Table.Cell>
						<Table.Cell>
							<Badge variant="secondary">{provider.providerType}</Badge>
						</Table.Cell>
						<Table.Cell class="text-muted-foreground text-sm">{provider.slug}</Table.Cell>
						<Table.Cell>
							<form method="POST" action="?/toggle" use:enhance={handleResult}>
								<input type="hidden" name="providerId" value={provider.id} />
								<Button type="submit" variant="ghost" size="sm" class="h-7 px-2 text-xs">
									{#if provider.enabled}
										<Badge variant="default">{m.common_active()}</Badge>
									{:else}
										<Badge variant="outline">{m.common_inactive()}</Badge>
									{/if}
								</Button>
							</form>
						</Table.Cell>
						<Table.Cell class="text-muted-foreground text-sm">
							{m.oidc_accounts_count({ count: provider.accountCount })}
						</Table.Cell>
						<Table.Cell>
							<div class="flex gap-1">
								<Button variant="ghost" size="sm" class="h-7 px-2 text-xs" href="/admin/oidc-providers/{provider.id}">
									{m.common_edit()}
								</Button>
								<Button
									variant="ghost"
									size="sm"
									class="text-destructive h-7 px-2 text-xs"
									onclick={() => openDeleteDialog({ id: provider.id, name: provider.name, accountCount: provider.accountCount })}
								>
									{m.common_delete()}
								</Button>
							</div>
						</Table.Cell>
					</Table.Row>
				{/each}
				{#if data.providers.length === 0}
					<Table.Row>
						<Table.Cell colspan={6} class="py-12 text-center">
							<div class="flex flex-col items-center gap-2">
								<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground">
									<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
									<path d="m9 12 2 2 4-4" />
								</svg>
								<p class="text-muted-foreground font-medium">{m.oidc_no_providers()}</p>
								<p class="text-muted-foreground text-sm">{m.oidc_no_providers_hint()}</p>
								<Button href="/admin/oidc-providers/new" size="sm" class="mt-2">{m.oidc_add_provider()}</Button>
							</div>
						</Table.Cell>
					</Table.Row>
				{/if}
			</Table.Body>
		</Table.Root>
	</Card.Root>
</div>

<AlertDialog.Root bind:open={deleteDialogOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{m.common_delete()}</AlertDialog.Title>
			<AlertDialog.Description>
				{m.oidc_delete_confirm({ name: deleteTarget?.name ?? '' })}
				{#if deleteTarget && deleteTarget.accountCount > 0}
					<br /><br />
					<span class="text-yellow-600">{m.oidc_has_accounts_warning()}</span>
				{/if}
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>{m.common_cancel()}</AlertDialog.Cancel>
			<form method="POST" action="?/deleteProvider" use:enhance={handleResult}>
				<input type="hidden" name="providerId" value={deleteTarget?.id ?? ''} />
				<Button type="submit" variant="destructive">{m.common_delete()}</Button>
			</form>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
