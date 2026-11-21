<script lang="ts">
	import { tick } from 'svelte';
	import type { SubmitFunction } from '@sveltejs/kit';
	import * as m from '$lib/paraglide/messages.js';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { SvelteSet } from 'svelte/reactivity';

	type LinkedAccount = {
		id: number;
		externalId: string;
		email: string | null;
		providerName: string;
		providerIconUrl: string | null;
	};
	type Provider = { slug: string; name: string; iconUrl: string | null };

	// The host page must provide the `?/unlink` action.
	let {
		linkedAccounts,
		availableProviders,
		hasPassword,
		title,
		level = 2
	}: {
		linkedAccounts: LinkedAccount[];
		availableProviders: Provider[];
		hasPassword: boolean;
		title: string;
		level?: 1 | 2;
	} = $props();

	let failedIconUrls = new SvelteSet<string>();
	let target = $state<LinkedAccount | null>(null);
	let confirmOpen = $state(false);
	let pending = $state(false);
	let unlinked = $state(false);
	let error = $state('');
	let errorEl = $state<HTMLElement | null>(null);
	let headingEl = $state<HTMLElement | null>(null);

	// The server refuses to remove the last way to sign in, so say so up front.
	const lastMethod = $derived(!hasPassword && linkedAccounts.length <= 1);

	function markIconFailed(url: string) {
		failedIconUrls.add(url);
	}

	function confirmUnlink(account: LinkedAccount) {
		target = account;
		error = '';
		unlinked = false;
		confirmOpen = true;
	}

	function failureMessage(serverError: unknown) {
		return serverError === 'Cannot unlink the last authentication method'
			? m.auth_account_last_method()
			: m.error_operation_failed();
	}

	const submit: SubmitFunction = ({ cancel }) => {
		if (pending) {
			cancel();
			return;
		}
		pending = true;
		error = '';
		return async ({ result, update }) => {
			try {
				if (result.type === 'success') {
					unlinked = true;
					confirmOpen = false;
					await invalidateAll();
					toast.success(m.oidc_account_unlinked());
				} else {
					error = failureMessage(result.type === 'failure' ? result.data?.error : undefined);
					await update({ reset: false });
					await tick();
					errorEl?.focus();
				}
			} finally {
				pending = false;
			}
		};
	};

	// The unlinked row disappears, so move focus to the heading instead of losing it.
	function restoreFocus(event: Event) {
		if (!unlinked) return;
		event.preventDefault();
		headingEl?.focus();
	}
</script>

<Card.Root>
	<Card.Header>
		<Card.Title
			bind:ref={headingEl}
			tabindex={-1}
			role="heading"
			aria-level={level}
			class="outline-none">{title}</Card.Title
		>
	</Card.Header>
	<Card.Content class="space-y-4">
		{#if linkedAccounts.length > 0}
			<div class="space-y-3">
				{#each linkedAccounts as account (account.id)}
					<div
						class="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
					>
						<div class="flex min-w-0 items-center gap-3">
							{#if account.providerIconUrl && !failedIconUrls.has(account.providerIconUrl)}
								<img
									src={account.providerIconUrl}
									alt=""
									class="h-6 w-6 shrink-0"
									onerror={() => markIconFailed(account.providerIconUrl!)}
								/>
							{:else}
								<div
									class="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-muted text-xs font-bold"
								>
									{account.providerName.charAt(0).toUpperCase()}
								</div>
							{/if}
							<div class="min-w-0 [overflow-wrap:anywhere]">
								<p class="text-sm font-medium">{account.providerName}</p>
								<p class="text-xs text-muted-foreground">
									{account.email || account.externalId}
								</p>
							</div>
						</div>
						<Button
							type="button"
							variant="outline"
							size="sm"
							class="min-h-10 w-full sm:w-auto"
							disabled={lastMethod}
							aria-label={m.auth_account_unlink_label({ name: account.providerName })}
							onclick={() => confirmUnlink(account)}
						>
							{m.oidc_unlink_account()}
						</Button>
					</div>
				{/each}
			</div>
			{#if lastMethod}
				<p class="text-sm text-muted-foreground">{m.auth_account_last_method()}</p>
			{/if}
		{:else}
			<p class="text-sm text-muted-foreground">{m.auth_account_no_linked()}</p>
		{/if}

		{#if availableProviders.length > 0}
			<div class="space-y-2 pt-2">
				<p class="text-sm font-medium">{m.oidc_link_account()}</p>
				{#each availableProviders as provider (provider.slug)}
					<Button
						variant="outline"
						class="h-auto min-h-10 w-full whitespace-normal"
						href="/auth/oidc/{provider.slug}?link=true"
						data-sveltekit-reload
					>
						{#if provider.iconUrl && !failedIconUrls.has(provider.iconUrl)}
							<img
								src={provider.iconUrl}
								alt=""
								class="h-4 w-4 shrink-0"
								onerror={() => markIconFailed(provider.iconUrl!)}
							/>
						{:else}
							<span
								class="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-muted text-[10px] font-bold text-muted-foreground"
								>{provider.name.charAt(0).toUpperCase()}</span
							>
						{/if}
						<span class="min-w-0 [overflow-wrap:anywhere]"
							>{m.oidc_login_with({ name: provider.name })}</span
						>
					</Button>
				{/each}
			</div>
		{/if}
	</Card.Content>
</Card.Root>

<AlertDialog.Root bind:open={confirmOpen}>
	{#if target}
		<AlertDialog.Content
			onCloseAutoFocus={restoreFocus}
			escapeKeydownBehavior={pending ? 'ignore' : 'close'}
		>
			<AlertDialog.Header>
				<AlertDialog.Title>{m.auth_account_unlink_title()}</AlertDialog.Title>
				<AlertDialog.Description class="[overflow-wrap:anywhere]">
					{m.auth_account_unlink_confirm({ name: target.providerName })}
				</AlertDialog.Description>
			</AlertDialog.Header>
			{#if error}
				<p role="alert" tabindex="-1" bind:this={errorEl} class="text-sm text-destructive">
					{error}
				</p>
			{/if}
			<AlertDialog.Footer>
				<AlertDialog.Cancel disabled={pending}>{m.common_cancel()}</AlertDialog.Cancel>
				<form method="POST" action="?/unlink" use:enhance={submit}>
					<input type="hidden" name="accountId" value={target.id} />
					<Button class="w-full sm:w-auto" type="submit" variant="destructive" disabled={pending}>
						{pending ? m.common_saving() : m.oidc_unlink_account()}
					</Button>
				</form>
			</AlertDialog.Footer>
		</AlertDialog.Content>
	{/if}
</AlertDialog.Root>
