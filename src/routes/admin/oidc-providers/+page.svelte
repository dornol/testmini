<script lang="ts">
	import { tick } from 'svelte';
	import type { SubmitFunction } from '@sveltejs/kit';
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

	type Provider = (typeof data.providers)[number];

	let change = $state<{ kind: 'toggle' | 'delete'; provider: Provider } | null>(null);
	let open = $state(false);
	let pending = $state(false);
	let done = $state(false);
	let error = $state('');
	let errorEl = $state<HTMLElement | null>(null);
	let addEl = $state<HTMLElement | null>(null);

	// A provider with linked accounts is disabled instead of deleted (server rule).
	const disablesInstead = $derived(change?.kind === 'delete' && change.provider.accountCount > 0);

	function openChange(kind: 'toggle' | 'delete', provider: Provider) {
		change = { kind, provider };
		error = '';
		done = false;
		open = true;
	}

	function successMessage(result: { enabled?: boolean; deleted?: boolean; disabled?: boolean }) {
		if (result.enabled === true) return m.oidc_provider_enabled();
		if (result.enabled === false || result.disabled) return m.oidc_provider_disabled();
		if (result.deleted) return m.oidc_provider_deleted();
		return m.admin_updated();
	}

	const submit: SubmitFunction = ({ cancel }) => {
		if (pending) {
			cancel();
			return;
		}
		pending = true;
		error = '';
		return async ({ result }) => {
			try {
				if (result.type === 'success') {
					done = true;
					open = false;
					await invalidateAll();
					toast.success(successMessage(result.data ?? {}));
				} else {
					const notFound = result.type === 'failure' && result.data?.error === 'Provider not found';
					error = notFound ? m.oidc_provider_not_found() : m.error_operation_failed();
					if (notFound) await invalidateAll();
					await tick();
					errorEl?.focus();
				}
			} finally {
				pending = false;
			}
		};
	};

	// The acted-on row may be gone, so land on a stable control instead of <body>.
	function restoreFocus(event: Event) {
		if (!done) return;
		event.preventDefault();
		addEl?.focus();
	}
</script>

{#snippet status(p: Provider)}
	<Badge variant={p.enabled ? 'default' : 'outline'}>
		{p.enabled ? m.common_active() : m.common_inactive()}
	</Badge>
{/snippet}

{#snippet actions(p: Provider)}
	{@const toggleLabel = p.enabled ? m.oidc_disable() : m.oidc_enable()}
	<div class="flex flex-wrap gap-1">
		<Button
			variant="ghost"
			size="sm"
			class="min-h-10 px-2 text-xs"
			href="/admin/oidc-providers/{p.id}"
			aria-label={m.oidc_provider_action_label({ name: p.name, action: m.common_edit() })}
		>
			{m.common_edit()}
		</Button>
		<Button
			type="button"
			variant="ghost"
			size="sm"
			class="min-h-10 px-2 text-xs"
			aria-label={m.oidc_provider_action_label({ name: p.name, action: toggleLabel })}
			onclick={() => openChange('toggle', p)}>{toggleLabel}</Button
		>
		<Button
			type="button"
			variant="ghost"
			size="sm"
			class="min-h-10 px-2 text-xs text-destructive"
			aria-label={m.oidc_provider_action_label({ name: p.name, action: m.common_delete() })}
			onclick={() => openChange('delete', p)}>{m.common_delete()}</Button
		>
	</div>
{/snippet}

<div class="space-y-4">
	<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h2 class="text-lg font-semibold">{m.oidc_providers_title()}</h2>
			<p class="text-sm text-muted-foreground">{m.oidc_providers_desc()}</p>
		</div>
		<Button
			bind:ref={addEl}
			href="/admin/oidc-providers/new"
			class="min-h-10 w-full sm:w-auto sm:self-auto">{m.oidc_add_provider()}</Button
		>
	</div>

	<div class="grid gap-3 md:hidden">
		{#each data.providers as provider (provider.id)}
			<div class="rounded-md border p-3">
				<a
					href="/admin/oidc-providers/{provider.id}"
					class="font-medium [overflow-wrap:anywhere] hover:underline"
				>
					{provider.name}
				</a>
				<div class="mt-2 flex flex-wrap items-center gap-2">
					<Badge variant="secondary">{provider.providerType}</Badge>
					{@render status(provider)}
				</div>
				<div class="mt-3 space-y-1 text-xs text-muted-foreground [overflow-wrap:anywhere]">
					<div>{m.oidc_slug()}: {provider.slug}</div>
					<div>
						{m.oidc_linked_accounts()}: {m.oidc_accounts_count({ count: provider.accountCount })}
					</div>
				</div>
				<div class="mt-2">{@render actions(provider)}</div>
			</div>
		{/each}
	</div>

	{#if data.providers.length > 0}
		<Card.Root class="hidden overflow-hidden md:block">
			<Table.Root class="table-fixed" aria-label={m.oidc_providers_title()}>
				<Table.Header>
					<Table.Row>
						<Table.Head>{m.common_name()}</Table.Head>
						<Table.Head class="w-24">{m.oidc_type()}</Table.Head>
						<Table.Head class="w-36">{m.oidc_slug()}</Table.Head>
						<Table.Head class="w-24">{m.common_status()}</Table.Head>
						<Table.Head class="w-32">{m.oidc_linked_accounts()}</Table.Head>
						<Table.Head class="w-56">{m.common_actions()}</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.providers as provider (provider.id)}
						<Table.Row>
							<Table.Cell class="whitespace-normal [overflow-wrap:anywhere]">
								<a href="/admin/oidc-providers/{provider.id}" class="font-medium hover:underline">
									{provider.name}
								</a>
							</Table.Cell>
							<Table.Cell><Badge variant="secondary">{provider.providerType}</Badge></Table.Cell>
							<Table.Cell
								class="text-sm whitespace-normal text-muted-foreground [overflow-wrap:anywhere]"
								>{provider.slug}</Table.Cell
							>
							<Table.Cell>{@render status(provider)}</Table.Cell>
							<Table.Cell class="text-sm text-muted-foreground">
								{m.oidc_accounts_count({ count: provider.accountCount })}
							</Table.Cell>
							<Table.Cell>{@render actions(provider)}</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</Card.Root>
	{/if}

	{#if data.providers.length === 0}
		<div class="rounded-md border border-dashed p-6 text-center">
			<p class="font-medium text-muted-foreground">{m.oidc_no_providers()}</p>
			<p class="mt-1 text-sm text-muted-foreground">{m.oidc_no_providers_hint()}</p>
			<Button href="/admin/oidc-providers/new" size="sm" class="mt-3 min-h-10 w-full sm:w-auto"
				>{m.oidc_add_provider()}</Button
			>
		</div>
	{/if}
</div>

<AlertDialog.Root bind:open>
	{#if change}
		{@const provider = change.provider}
		<AlertDialog.Content
			onCloseAutoFocus={restoreFocus}
			escapeKeydownBehavior={pending ? 'ignore' : 'close'}
		>
			<AlertDialog.Header>
				<AlertDialog.Title>
					{change.kind === 'delete' && !disablesInstead
						? m.common_delete()
						: m.admin_confirm_toggle_title()}
				</AlertDialog.Title>
				<AlertDialog.Description class="[overflow-wrap:anywhere]">
					{#if change.kind === 'toggle'}
						{provider.enabled
							? m.oidc_disable_confirm({ name: provider.name })
							: m.oidc_enable_confirm({ name: provider.name })}
					{:else}
						{m.oidc_delete_confirm({ name: provider.name })}
					{/if}
				</AlertDialog.Description>
			</AlertDialog.Header>
			{#if disablesInstead}
				<p class="text-sm text-amber-700 dark:text-amber-400">{m.oidc_has_accounts_warning()}</p>
			{/if}
			{#if error}
				<p role="alert" tabindex="-1" bind:this={errorEl} class="text-sm text-destructive">
					{error}
				</p>
			{/if}
			<AlertDialog.Footer>
				<AlertDialog.Cancel class="min-h-10 w-full sm:w-auto" disabled={pending}
					>{m.common_cancel()}</AlertDialog.Cancel
				>
				<form
					method="POST"
					action={change.kind === 'toggle' ? '?/toggle' : '?/deleteProvider'}
					use:enhance={submit}
					class="w-full sm:w-auto"
				>
					<input type="hidden" name="providerId" value={provider.id} />
					<Button
						type="submit"
						variant={change.kind === 'toggle' && !provider.enabled ? 'default' : 'destructive'}
						class="min-h-10 w-full sm:w-auto"
						disabled={pending}
					>
						{#if pending}
							{m.common_saving()}
						{:else if change.kind === 'toggle'}
							{provider.enabled ? m.oidc_disable() : m.oidc_enable()}
						{:else}
							{disablesInstead ? m.oidc_disable() : m.common_delete()}
						{/if}
					</Button>
				</form>
			</AlertDialog.Footer>
		</AlertDialog.Content>
	{/if}
</AlertDialog.Root>
