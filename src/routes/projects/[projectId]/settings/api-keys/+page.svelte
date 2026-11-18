<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { page } from '$app/state';
	import { apiFetch } from '$lib/api-client';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import PageHeader from '$lib/components/patterns/PageHeader.svelte';
	import * as m from '$lib/paraglide/messages.js';
	import { getLocale } from '$lib/paraglide/runtime';

	let { data } = $props();
	type ApiKey = {
		id: number;
		name: string;
		prefix: string;
		lastUsedAt: string | null;
		createdAt: string;
	};
	type CopyTarget = 'key' | 'config';
	type Agent = 'Claude Code' | 'Cursor' | 'Windsurf';

	const endpoint = $derived(`/api/projects/${data.project.id}/api-keys`);
	const mcpEndpoint = $derived(new URL('/api/mcp', page.url).href);
	const mcpName = $derived(
		data.project.name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '') || 'project'
	);
	const agents: Agent[] = ['Claude Code', 'Cursor', 'Windsurf'];
	let agent = $state<Agent>('Claude Code');
	let apiKeys = $state<ApiKey[]>([]);
	let listState = $state<'loading' | 'ready' | 'error'>('loading');
	let pending = $state<'issue' | 'revoke' | null>(null);
	let dialogOpen = $state(false);
	let name = $state('');
	let nameInvalid = $state(false);
	let issueFailure = $state<string | null>(null);
	let revealed = $state<{ value: string; name: string } | null>(null);
	let copied = $state(false);
	let copying = $state(false);
	let copyFeedback = $state<string | null>(null);
	let confirmClose = $state(false);
	let revokeOpen = $state(false);
	let revokeTarget = $state<ApiKey | null>(null);
	let revokeFailed = $state(false);
	let revoked = $state(false);
	let revokeTrigger: HTMLElement | null = null;
	let addButton = $state<HTMLButtonElement | null>(null);
	let listPanel = $state<HTMLElement | null>(null);
	let issueAlert = $state<HTMLElement | null>(null);
	let revokeAlert = $state<HTMLElement | null>(null);
	let closeNotice = $state<HTMLElement | null>(null);
	let keyField = $state<HTMLTextAreaElement | null>(null);
	let configurationField = $state<HTMLTextAreaElement | null>(null);
	const configuration = $derived(revealed ? connectionText(revealed.value) : '');

	onMount(() => {
		const controller = new AbortController();
		void loadKeys(controller.signal);
		return () => controller.abort();
	});

	async function loadKeys(signal?: AbortSignal) {
		listState = 'loading';
		try {
			const items = await apiFetch<ApiKey[]>(endpoint, { silent: true, signal });
			if (signal?.aborted) return;
			apiKeys = items;
			listState = 'ready';
		} catch {
			if (!signal?.aborted) listState = 'error';
		}
	}

	function startIssue() {
		name = '';
		nameInvalid = false;
		issueFailure = null;
		copyFeedback = null;
		copied = false;
		confirmClose = false;
		agent = 'Claude Code';
		dialogOpen = true;
		revoked = false;
	}

	async function issue(event: SubmitEvent) {
		event.preventDefault();
		if (pending) return;
		issueFailure = null;
		nameInvalid = !name.trim();
		if (nameInvalid) {
			issueFailure = m.settings_catalog_name_required();
			await tick();
			issueAlert?.focus();
			return;
		}
		pending = 'issue';
		try {
			const { key, ...metadata } = await apiFetch<Omit<ApiKey, 'lastUsedAt'> & { key: string }>(
				endpoint,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ name: name.trim() }),
					silent: true
				}
			);
			apiKeys = [{ ...metadata, lastUsedAt: null }, ...apiKeys];
			revealed = { value: key, name: metadata.name };
			name = '';
			await tick();
			keyField?.focus();
		} catch {
			issueFailure = m.ui_save_failed();
			await tick();
			issueAlert?.focus();
		} finally {
			pending = null;
		}
	}

	function connectionText(key: string) {
		const headers = { Authorization: `Bearer ${key}` };
		if (agent === 'Claude Code')
			return `claude mcp add ${mcpName} --transport http ${mcpEndpoint} -H "Authorization: Bearer ${key}"`;

		const connection = agent === 'Cursor' ? { url: mcpEndpoint } : { serverUrl: mcpEndpoint };
		return JSON.stringify({ mcpServers: { [mcpName]: { ...connection, headers } } }, null, 2);
	}

	async function copy(target: CopyTarget) {
		if (copying || !revealed) return;
		copying = true;
		copyFeedback = null;
		const key = target === 'key';
		try {
			await navigator.clipboard.writeText(key ? revealed.value : configuration);
			copied = true;
			copyFeedback = key ? m.api_key_copied() : m.mcp_copied();
		} catch {
			const field = key ? keyField : configurationField;
			field?.focus();
			field?.select();
			copyFeedback = m.api_key_manual_copy();
		} finally {
			copying = false;
		}
	}

	async function requestClose() {
		if (copying) return;
		if (copied) closeIssue();
		else {
			confirmClose = true;
			await tick();
			closeNotice?.focus();
		}
	}

	function closeIssue() {
		if (copying) return;
		dialogOpen = false;
		revealed = null;
		confirmClose = false;
		copyFeedback = null;
	}

	function restoreIssueFocus(event: Event) {
		event.preventDefault();
		addButton?.focus();
	}

	function startRevoke(key: ApiKey, trigger: HTMLElement) {
		revokeTarget = key;
		revokeTrigger = trigger;
		revokeFailed = false;
		revoked = false;
		revokeOpen = true;
	}

	async function revoke() {
		if (pending || !revokeTarget) return;
		const id = revokeTarget.id;
		pending = 'revoke';
		revokeFailed = false;
		try {
			await apiFetch(endpoint + '/' + id, { method: 'DELETE', silent: true });
			apiKeys = apiKeys.filter((entry) => entry.id !== id);
			revoked = true;
			revokeOpen = false;
		} catch {
			revokeFailed = true;
			await tick();
			revokeAlert?.focus();
		} finally {
			pending = null;
		}
	}

	function restoreRevokeFocus(event: Event) {
		event.preventDefault();
		(revokeTrigger?.isConnected ? revokeTrigger : addButton)?.focus();
	}

	function formatDate(date: string) {
		return new Date(date).toLocaleDateString(getLocale());
	}
</script>

<div class="space-y-4">
	<PageHeader title={m.api_keys_title()} description={m.api_keys_desc()}>
		{#snippet actions()}
			<Button
				bind:ref={addButton}
				class="w-full sm:w-auto"
				disabled={pending !== null || listState === 'loading'}
				onclick={startIssue}>{m.api_key_generate()}</Button
			>
		{/snippet}
	</PageHeader>

	{#if revoked}<p role="status" class="text-sm text-muted-foreground">{m.api_key_revoked()}</p>{/if}
	<section aria-label={m.api_keys_title()} tabindex="-1" bind:this={listPanel} class="space-y-3">
		{#if listState === 'loading'}
			<p role="status" class="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
				{m.common_loading()}
			</p>
		{:else if listState === 'error'}
			<p role="alert" class="text-sm text-destructive">{m.api_key_list_failed()}</p>
			<Button
				type="button"
				variant="outline"
				onclick={() => {
					listPanel?.focus();
					void loadKeys();
				}}>{m.my_work_retry()}</Button
			>
		{:else if apiKeys.length === 0}
			<p class="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
				{m.api_keys_empty()}
			</p>
		{/if}
		{#if apiKeys.length}
			<ul aria-label={m.api_keys_title()} class="divide-y rounded-xl border bg-card">
				{#each apiKeys as key (key.id)}
					<li class="flex min-w-0 flex-wrap items-start justify-between gap-3 p-4">
						<div class="min-w-0 basis-full space-y-2 sm:flex-1">
							<div class="flex flex-wrap items-center gap-2">
								<h4 class="font-medium [overflow-wrap:anywhere]">{key.name}</h4>
								<code class="rounded bg-muted px-2 py-1 text-xs text-muted-foreground"
									>{key.prefix}…</code
								>
							</div>
							<dl class="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
								<div class="flex gap-1">
									<dt>{m.common_created()}</dt>
									<dd><time datetime={key.createdAt}>{formatDate(key.createdAt)}</time></dd>
								</div>
								<div class="flex gap-1">
									<dt>{m.api_key_last_used()}</dt>
									<dd>{key.lastUsedAt ? formatDate(key.lastUsedAt) : '—'}</dd>
								</div>
							</dl>
						</div>
						<Button
							variant="outline"
							size="sm"
							class="text-destructive"
							disabled={pending !== null}
							aria-label={m.settings_catalog_item_action({
								action: m.api_key_revoke(),
								name: key.name
							})}
							onclick={(event) => startRevoke(key, event.currentTarget)}
							>{m.api_key_revoke()}</Button
						>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</div>

<Dialog.Root bind:open={dialogOpen}>
	<Dialog.Content
		onCloseAutoFocus={restoreIssueFocus}
		escapeKeydownBehavior={revealed || pending ? 'ignore' : 'close'}
		interactOutsideBehavior={revealed || pending ? 'ignore' : 'close'}
		showCloseButton={!revealed && !pending}
	>
		<Dialog.Header>
			<Dialog.Title
				>{revealed ? m.api_key_created_title() : m.api_key_generate_title()}</Dialog.Title
			>
			<Dialog.Description
				>{revealed ? m.api_key_created_desc() : m.api_key_generate_desc()}</Dialog.Description
			>
		</Dialog.Header>
		{#if revealed}
			<div class="min-w-0 space-y-4">
				<div class="space-y-2">
					<p class="font-medium [overflow-wrap:anywhere]">{revealed.name}</p>
					<label for="issued-key" class="block text-sm font-medium">{m.api_key_value()}</label>
					<Textarea
						id="issued-key"
						bind:ref={keyField}
						readonly
						spellcheck={false}
						value={revealed.value}
						rows={2}
						class="font-mono [overflow-wrap:anywhere]"
					/>
					<Button type="button" variant="outline" disabled={copying} onclick={() => copy('key')}
						>{m.api_key_copy_value()}</Button
					>
				</div>
				<section aria-labelledby="mcp-connect-heading" class="space-y-2 border-t pt-3">
					<h3 id="mcp-connect-heading" class="text-sm font-semibold">{m.mcp_connect_title()}</h3>
					<select
						aria-label={m.mcp_connect_title()}
						bind:value={agent}
						onchange={() => (copyFeedback = null)}
						class="h-10 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-2 focus-visible:outline-ring"
					>
						{#each agents as item (item)}<option value={item}>{item}</option>{/each}
					</select>
					<Textarea
						aria-label={m.api_key_config_value()}
						bind:ref={configurationField}
						readonly
						spellcheck={false}
						value={configuration}
						rows={3}
						class="font-mono text-sm [overflow-wrap:anywhere]"
					/>
					<Button type="button" variant="outline" disabled={copying} onclick={() => copy('config')}
						>{m.api_key_copy_config()}</Button
					>
					{#if agent === 'Claude Code'}
						<p class="text-sm text-muted-foreground">{m.mcp_hint_terminal()}</p>
					{:else}
						<p class="text-sm text-muted-foreground">
							{m.mcp_hint_config({
								file: agent === 'Cursor' ? '.cursor/mcp.json' : '.windsurf/mcp.json'
							})}
						</p>
					{/if}
				</section>
				{#if copyFeedback}<p role="status" class="text-sm text-muted-foreground">
						{copyFeedback}
					</p>{/if}
				{#if confirmClose}
					<div class="space-y-2 rounded-md border border-destructive/40 p-3">
						<p tabindex="-1" bind:this={closeNotice} class="text-sm">
							{m.api_key_close_without_copy()}
						</p>
						<div class="flex flex-wrap gap-2">
							<Button
								type="button"
								variant="outline"
								onclick={() => {
									confirmClose = false;
									keyField?.focus();
								}}>{m.api_key_keep_open()}</Button
							>
							<Button type="button" variant="destructive" disabled={copying} onclick={closeIssue}
								>{m.api_key_close_anyway()}</Button
							>
						</div>
					</div>
				{:else}
					<Dialog.Footer>
						<Button type="button" disabled={copying} onclick={requestClose}
							>{m.common_close()}</Button
						>
					</Dialog.Footer>
				{/if}
			</div>
		{:else}
			<form onsubmit={issue} class="space-y-4">
				{#if issueFailure}<p
						role="alert"
						id="key-create-error"
						tabindex="-1"
						bind:this={issueAlert}
						class="text-sm text-destructive"
					>
						{issueFailure}
					</p>{/if}
				<div class="space-y-1">
					<label for="key-name" class="block text-sm font-medium">{m.api_key_name_label()}</label>
					<Input
						id="key-name"
						placeholder={m.api_key_name_placeholder()}
						required
						maxlength={100}
						bind:value={name}
						disabled={pending !== null}
						aria-invalid={nameInvalid || undefined}
						aria-describedby={nameInvalid ? 'key-create-error' : undefined}
					/>
				</div>
				<Dialog.Footer>
					<Button type="button" variant="outline" disabled={pending !== null} onclick={closeIssue}
						>{m.common_cancel()}</Button
					>
					<Button type="submit" disabled={pending !== null}
						>{pending === 'issue' ? m.api_key_generating() : m.api_key_generate()}</Button
					>
				</Dialog.Footer>
			</form>
		{/if}
	</Dialog.Content>
</Dialog.Root>

<AlertDialog.Root bind:open={revokeOpen}>
	{#if revokeTarget}
		<AlertDialog.Content
			onCloseAutoFocus={restoreRevokeFocus}
			escapeKeydownBehavior={pending === 'revoke' ? 'ignore' : 'close'}
		>
			<AlertDialog.Header>
				<AlertDialog.Title>{m.api_key_revoke_title()}</AlertDialog.Title>
				<AlertDialog.Description class="[overflow-wrap:anywhere]"
					>{m.api_key_revoke_confirm({ name: revokeTarget.name })}</AlertDialog.Description
				>
			</AlertDialog.Header>
			{#if revokeFailed}<p
					role="alert"
					tabindex="-1"
					bind:this={revokeAlert}
					class="text-sm text-destructive"
				>
					{m.error_remove_failed()}
				</p>{/if}
			<AlertDialog.Footer>
				<AlertDialog.Cancel disabled={pending !== null}>{m.common_cancel()}</AlertDialog.Cancel>
				<Button type="button" variant="destructive" disabled={pending !== null} onclick={revoke}
					>{pending === 'revoke' ? m.common_saving() : m.api_key_revoke()}</Button
				>
			</AlertDialog.Footer>
		</AlertDialog.Content>
	{/if}
</AlertDialog.Root>
