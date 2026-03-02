<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { toast } from 'svelte-sonner';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as m from '$lib/paraglide/messages.js';

	let { data } = $props();

	let displayName = $state(data.userData.name);
	let currentPassword = $state('');
	let newPassword = $state('');
	let confirmPassword = $state('');

	function handleNameResult() {
		return async ({
			result,
			update
		}: {
			result: { type: string; data?: Record<string, unknown> };
			update: () => Promise<void>;
		}) => {
			if (result.type === 'success') {
				toast.success(m.profile_name_updated());
				await invalidateAll();
			} else if (result.type === 'failure') {
				toast.error((result.data?.error as string) ?? 'Failed to update');
				await update();
			}
		};
	}

	function handlePasswordResult() {
		return async ({
			result,
			update
		}: {
			result: { type: string; data?: Record<string, unknown> };
			update: () => Promise<void>;
		}) => {
			if (result.type === 'success') {
				toast.success(m.profile_password_updated());
				currentPassword = '';
				newPassword = '';
				confirmPassword = '';
				await invalidateAll();
			} else if (result.type === 'failure') {
				const err = result.data?.passwordError as string;
				if (err === 'password_mismatch') {
					toast.error(m.profile_password_mismatch());
				} else if (err === 'password_wrong') {
					toast.error(m.profile_password_wrong());
				} else {
					toast.error(err ?? 'Failed to change password');
				}
				await update();
			}
		};
	}

	function handleUnlinkResult() {
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
				toast.error((result.data?.error as string) ?? 'Operation failed');
				await update();
			}
		};
	}
</script>

<div class="mx-auto max-w-2xl space-y-4">
	<h1 class="text-xl font-bold">{m.profile_title()}</h1>

	<!-- Account Information -->
	<Card.Root>
		<Card.Header>
			<Card.Title>{m.profile_account_info()}</Card.Title>
		</Card.Header>
		<Card.Content class="space-y-4">
			<form method="POST" action="?/updateName" use:enhance={handleNameResult} class="space-y-4">
				<div class="space-y-2">
					<Label for="displayName">{m.profile_display_name()}</Label>
					<div class="flex gap-2">
						<Input id="displayName" name="name" bind:value={displayName} class="flex-1" />
						<Button type="submit" size="sm">{m.common_save_changes()}</Button>
					</div>
				</div>
			</form>

			<div class="space-y-2">
				<Label>{m.profile_email()}</Label>
				<p class="text-muted-foreground text-sm">{data.userData.email}</p>
			</div>

			<div class="space-y-2">
				<Label>{m.profile_member_since()}</Label>
				<p class="text-muted-foreground text-sm">{new Date(data.userData.createdAt).toLocaleDateString()}</p>
			</div>
		</Card.Content>
	</Card.Root>

	<!-- Change Password -->
	{#if data.hasPassword}
		<Card.Root>
			<Card.Header>
				<Card.Title>{m.profile_change_password()}</Card.Title>
			</Card.Header>
			<Card.Content>
				<form method="POST" action="?/changePassword" use:enhance={handlePasswordResult} class="space-y-4">
					<div class="space-y-2">
						<Label for="currentPassword">{m.profile_current_password()}</Label>
						<Input id="currentPassword" name="currentPassword" type="password" bind:value={currentPassword} />
					</div>
					<div class="space-y-2">
						<Label for="newPassword">{m.profile_new_password()}</Label>
						<Input id="newPassword" name="newPassword" type="password" bind:value={newPassword} />
					</div>
					<div class="space-y-2">
						<Label for="confirmPassword">{m.profile_confirm_password()}</Label>
						<Input id="confirmPassword" name="confirmPassword" type="password" bind:value={confirmPassword} />
					</div>
					<Button type="submit" disabled={!currentPassword || !newPassword || !confirmPassword}>
						{m.profile_change_password()}
					</Button>
				</form>
			</Card.Content>
		</Card.Root>
	{/if}

	<!-- Connected Accounts -->
	<Card.Root>
		<Card.Header>
			<Card.Title>{m.profile_connected_accounts()}</Card.Title>
		</Card.Header>
		<Card.Content class="space-y-4">
			{#if data.linkedAccounts.length > 0}
				<div class="space-y-3">
					{#each data.linkedAccounts as acct (acct.id)}
						<div class="flex items-center justify-between rounded-lg border p-3">
							<div class="flex items-center gap-3">
								{#if acct.providerIconUrl}
									<img src={acct.providerIconUrl} alt="" class="h-6 w-6" />
								{:else}
									<div class="bg-muted flex h-6 w-6 items-center justify-center rounded text-xs font-bold">
										{acct.providerName.charAt(0).toUpperCase()}
									</div>
								{/if}
								<div>
									<p class="text-sm font-medium">{acct.providerName}</p>
									<p class="text-muted-foreground text-xs">{acct.email || acct.externalId}</p>
								</div>
							</div>
							<form method="POST" action="?/unlink" use:enhance={handleUnlinkResult}>
								<input type="hidden" name="accountId" value={acct.id} />
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
</div>
