<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { apiPost } from '$lib/api-client';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';

	let { data } = $props();

	let name = $state(data.provider.name);
	let slug = $state(data.provider.slug);
	let providerType = $state(data.provider.providerType);
	let clientId = $state(data.provider.clientId);
	let clientSecret = $state('');
	let issuerUrl = $state(data.provider.issuerUrl ?? '');
	let authorizationUrl = $state(data.provider.authorizationUrl);
	let tokenUrl = $state(data.provider.tokenUrl);
	let userinfoUrl = $state(data.provider.userinfoUrl ?? '');
	let scopes = $state(data.provider.scopes);
	let autoRegister = $state(data.provider.autoRegister);
	let iconUrl = $state(data.provider.iconUrl ?? '');
	let displayOrder = $state(data.provider.displayOrder);
	let discovering = $state(false);
	let deleteDialogOpen = $state(false);

	async function discover() {
		if (!issuerUrl) return;
		discovering = true;
		try {
			const d = await apiPost<{ authorizationUrl?: string; tokenUrl?: string; userinfoUrl?: string }>('/api/admin/oidc-providers/discover', { issuerUrl });
			authorizationUrl = d.authorizationUrl || '';
			tokenUrl = d.tokenUrl || '';
			userinfoUrl = d.userinfoUrl || '';
			toast.success(m.oidc_discover_success());
		} catch {
			// error toast handled by apiPost
		} finally {
			discovering = false;
		}
	}

	function handleUpdateResult() {
		return async ({
			result,
			update
		}: {
			result: { type: string; data?: Record<string, unknown> };
			update: () => Promise<void>;
		}) => {
			if (result.type === 'success') {
				toast.success(m.oidc_provider_updated());
				await invalidateAll();
			} else if (result.type === 'failure') {
				toast.error((result.data?.error as string) ?? 'Update failed');
				await update();
			}
		};
	}

	function handleDeleteResult() {
		return async ({
			result,
			update
		}: {
			result: { type: string; data?: Record<string, unknown> };
			update: () => Promise<void>;
		}) => {
			if (result.type === 'redirect') {
				toast.success(m.oidc_provider_deleted());
				return;
			}
			if (result.type === 'failure') {
				toast.error((result.data?.error as string) ?? 'Delete failed');
				deleteDialogOpen = false;
				await update();
			}
		};
	}
</script>

<div class="space-y-4">
	<div class="flex items-center gap-2">
		<Button variant="ghost" size="sm" href="/admin/oidc-providers">
			{m.common_back_to({ target: m.oidc_providers_title() })}
		</Button>
	</div>

	<Card.Root>
		<Card.Header>
			<Card.Title>{m.oidc_edit_provider()}</Card.Title>
		</Card.Header>
		<Card.Content>
			<form method="POST" action="?/update" use:enhance={handleUpdateResult} class="space-y-4">
				<div class="grid grid-cols-2 gap-4">
					<div class="space-y-2">
						<Label for="name">{m.oidc_provider_name()}</Label>
						<Input id="name" name="name" bind:value={name} required />
					</div>
					<div class="space-y-2">
						<Label for="slug">{m.oidc_provider_slug()}</Label>
						<Input id="slug" name="slug" bind:value={slug} required />
					</div>
				</div>

				<div class="space-y-2">
					<Label for="providerType">{m.oidc_provider_type()}</Label>
					<select id="providerType" name="providerType" bind:value={providerType} class="border-input bg-background ring-offset-background flex h-10 w-full rounded-md border px-3 py-2 text-sm">
						<option value="OIDC">OIDC</option>
						<option value="OAUTH2">OAuth2</option>
					</select>
				</div>

				<div class="grid grid-cols-2 gap-4">
					<div class="space-y-2">
						<Label for="clientId">{m.oidc_client_id()}</Label>
						<Input id="clientId" name="clientId" bind:value={clientId} required />
					</div>
					<div class="space-y-2">
						<Label for="clientSecret">{m.oidc_client_secret()}</Label>
						<Input id="clientSecret" name="clientSecret" type="password" bind:value={clientSecret} placeholder={m.oidc_client_secret_keep()} />
					</div>
				</div>

				<div class="space-y-2">
					<Label for="issuerUrl">{m.oidc_issuer_url()}</Label>
					<div class="flex gap-2">
						<Input id="issuerUrl" name="issuerUrl" bind:value={issuerUrl} />
						<Button type="button" variant="outline" onclick={discover} disabled={discovering || !issuerUrl}>
							{m.oidc_discover()}
						</Button>
					</div>
				</div>

				<div class="grid grid-cols-2 gap-4">
					<div class="space-y-2">
						<Label for="authorizationUrl">{m.oidc_authorization_url()}</Label>
						<Input id="authorizationUrl" name="authorizationUrl" bind:value={authorizationUrl} required />
					</div>
					<div class="space-y-2">
						<Label for="tokenUrl">{m.oidc_token_url()}</Label>
						<Input id="tokenUrl" name="tokenUrl" bind:value={tokenUrl} required />
					</div>
				</div>

				<div class="space-y-2">
					<Label for="userinfoUrl">{m.oidc_userinfo_url()}</Label>
					<Input id="userinfoUrl" name="userinfoUrl" bind:value={userinfoUrl} />
				</div>

				<div class="space-y-2">
					<Label for="scopes">{m.oidc_scopes()}</Label>
					<Input id="scopes" name="scopes" bind:value={scopes} />
				</div>

				<div class="grid grid-cols-2 gap-4">
					<div class="space-y-2">
						<Label for="iconUrl">{m.oidc_icon_url()}</Label>
						<Input id="iconUrl" name="iconUrl" bind:value={iconUrl} />
					</div>
					<div class="space-y-2">
						<Label for="displayOrder">{m.oidc_display_order()}</Label>
						<Input id="displayOrder" name="displayOrder" type="number" bind:value={displayOrder} />
					</div>
				</div>

				<div class="flex items-center gap-2">
					<input id="autoRegister" name="autoRegister" type="checkbox" bind:checked={autoRegister} class="h-4 w-4 rounded border" />
					<Label for="autoRegister">{m.oidc_auto_register()}</Label>
				</div>

				<div class="flex justify-end gap-2">
					<Button variant="outline" href="/admin/oidc-providers">{m.common_cancel()}</Button>
					<Button type="submit">{m.common_save_changes()}</Button>
				</div>
			</form>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title class="text-destructive">{m.settings_danger_zone()}</Card.Title>
		</Card.Header>
		<Card.Content>
			<div class="flex items-center justify-between">
				<div>
					<p class="text-sm font-medium">{m.common_delete()}</p>
					{#if data.accountCount > 0}
						<p class="text-muted-foreground text-sm">{m.oidc_has_accounts_warning()}</p>
					{/if}
				</div>
				<Button variant="destructive" onclick={() => { deleteDialogOpen = true; }}>
					{m.common_delete()}
				</Button>
			</div>
		</Card.Content>
	</Card.Root>
</div>

<AlertDialog.Root bind:open={deleteDialogOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{m.common_delete()}</AlertDialog.Title>
			<AlertDialog.Description>
				{m.oidc_delete_confirm({ name: data.provider.name })}
				{#if data.accountCount > 0}
					<br /><br />
					<span class="text-yellow-600">{m.oidc_has_accounts_warning()}</span>
				{/if}
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>{m.common_cancel()}</AlertDialog.Cancel>
			<form method="POST" action="?/deleteProvider" use:enhance={handleDeleteResult}>
				<Button type="submit" variant="destructive">{m.common_delete()}</Button>
			</form>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
