<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { page } from '$app/state';
	import { apiFetch } from '$lib/api-client';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import PageHeader from '$lib/components/patterns/PageHeader.svelte';
	import * as m from '$lib/paraglide/messages.js';

	const PROVIDERS = ['JIRA', 'GITHUB', 'GITLAB', 'GITEA', 'CUSTOM'] as const;
	type Provider = (typeof PROVIDERS)[number];
	type Draft = { endpoint: string; key: string };
	type Feedback = { message: string; error?: boolean };
	let { data } = $props();
	type Config = NonNullable<typeof data.issueTrackerConfig>;

	const settings = {
		JIRA: {
			label: m.issue_tracker_provider_JIRA,
			address: m.issue_tracker_base_url,
			sample: 'https://company.atlassian.net',
			key: m.issue_tracker_project_key,
			keySample: 'PROJ'
		},
		GITHUB: {
			label: m.issue_tracker_provider_GITHUB,
			address: null,
			sample: 'https://github.com',
			key: m.issue_tracker_repo,
			keySample: 'owner/repo'
		},
		GITLAB: {
			label: m.issue_tracker_provider_GITLAB,
			address: m.issue_tracker_gitlab_url,
			sample: 'https://gitlab.com',
			key: m.issue_tracker_gitlab_project_id,
			keySample: '12345'
		},
		GITEA: {
			label: m.issue_tracker_provider_GITEA,
			address: m.issue_tracker_gitea_url,
			sample: 'https://gitea.example.com',
			key: m.issue_tracker_repo,
			keySample: 'owner/repo'
		},
		CUSTOM: {
			label: m.issue_tracker_provider_CUSTOM,
			address: m.issue_tracker_custom_endpoint,
			sample: 'https://api.example.com/issues',
			key: null,
			keySample: ''
		}
	};

	const initial = untrack(() => data.issueTrackerConfig);
	const endpoint = $derived(`/api/projects/${data.project.id}/issue-tracker`);
	const webhookUrl = $derived(new URL('/api/webhooks/issues', page.url).href);
	let config = $state<Config | null>(initial);
	let provider = $state<Provider>((initial?.provider as Provider) ?? 'JIRA');
	let drafts = $state(emptyDrafts(initial));
	let apiToken = $state('');
	let webhookSecret = $state('');
	let customHeaders = $state(headersText(initial));
	const connection = $derived(settings[provider]);
	const draft = $derived(drafts[provider]);
	const sameProvider = $derived(config?.provider === provider);
	const savedToken = $derived(sameProvider && config?.hasApiToken);
	const savedSecret = $derived(sameProvider && config?.hasWebhookSecret);
	let pending = $state<'save' | 'test' | 'delete' | null>(null);
	let feedback = $state<Feedback | null>(null);
	let invalidField = $state<'headers' | 'token' | 'key' | null>(null);
	let copyFeedback = $state<string | null>(null);
	let urlField = $state<HTMLInputElement | null>(null);
	let formFeedback = $state<HTMLElement | null>(null);
	let deleteOpen = $state(false);
	let deletionFailed = $state(false);
	let deleteFeedback = $state<HTMLElement | null>(null);
	let deleteTrigger = $state<HTMLButtonElement | null>(null);
	let providerControl = $state<HTMLSelectElement | null>(null);

	function emptyDrafts(saved: Config | null): Record<Provider, Draft> {
		const entries = {} as Record<Provider, Draft>;
		for (const item of PROVIDERS)
			entries[item] =
				saved?.provider === item
					? { endpoint: saved.baseUrl, key: saved.projectKey ?? '' }
					: { endpoint: '', key: '' };
		return entries;
	}

	function headersText(saved: Config | null): string {
		const headers = saved?.provider === 'CUSTOM' && saved.customTemplate?.headers;
		return headers ? JSON.stringify(headers, null, 2) : '';
	}

	function request<T>(method: 'POST' | 'DELETE', url: string, payload?: Record<string, unknown>) {
		return apiFetch<T>(url, {
			method,
			silent: true,
			...(payload && {
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			})
		});
	}

	function providerChanged() {
		apiToken = '';
		webhookSecret = '';
		feedback = null;
		invalidField = null;
		copyFeedback = null;
	}

	async function showError(message: string) {
		feedback = { message, error: true };
		await tick();
		formFeedback?.focus();
	}

	async function handleSave(event: SubmitEvent) {
		event.preventDefault();
		if (pending) return;
		invalidField = null;
		feedback = null;
		if (connection.key && !draft.key.trim()) {
			invalidField = 'key';
			await showError(m.issue_tracker_field_required({ label: connection.key() }));
			return;
		}
		if (!savedToken && provider !== 'CUSTOM' && !apiToken.trim()) {
			invalidField = 'token';
			await showError(m.issue_tracker_field_required({ label: m.issue_tracker_api_token() }));
			return;
		}
		const payload: Record<string, unknown> = {
			provider,
			enabled: true,
			baseUrl: provider === 'GITHUB' ? connection.sample : draft.endpoint.trim(),
			projectKey: connection.key ? draft.key.trim() : null
		};
		if (apiToken.trim() || !sameProvider) payload.apiToken = apiToken.trim() || null;
		if (webhookSecret.trim() || !sameProvider) payload.webhookSecret = webhookSecret.trim() || null;
		if (provider === 'CUSTOM') {
			try {
				const headers: unknown = customHeaders.trim() ? JSON.parse(customHeaders) : {};
				if (
					!headers ||
					typeof headers !== 'object' ||
					Array.isArray(headers) ||
					Object.values(headers).some((value) => typeof value !== 'string')
				) {
					throw new Error('Headers must be a JSON object with string values');
				}
				payload.customTemplate = { ...(sameProvider ? config?.customTemplate : {}), headers };
			} catch {
				invalidField = 'headers';
				await showError(m.issue_tracker_invalid_headers());
				return;
			}
		}
		pending = 'save';
		try {
			const saved = await request<Config>('POST', endpoint, payload);
			config = saved;
			drafts[provider] = { endpoint: saved.baseUrl, key: saved.projectKey ?? '' };
			apiToken = '';
			webhookSecret = '';
			feedback = { message: m.issue_tracker_saved() };
		} catch {
			await showError(m.ui_save_failed());
		} finally {
			pending = null;
		}
	}

	async function handleTest() {
		if (pending) return;
		pending = 'test';
		feedback = null;
		try {
			const result = await request<{ ok: boolean }>('POST', endpoint + '/test', {});
			if (result.ok) feedback = { message: m.issue_tracker_test_success() };
			else await showError(m.issue_tracker_test_failed());
		} catch {
			await showError(m.issue_tracker_test_failed());
		} finally {
			pending = null;
		}
	}

	async function handleDelete() {
		if (pending) return;
		pending = 'delete';
		deletionFailed = false;
		try {
			await request('DELETE', endpoint);
			config = null;
			provider = 'JIRA';
			drafts = emptyDrafts(null);
			customHeaders = '';
			providerChanged();
			feedback = { message: m.issue_tracker_deleted() };
			deleteOpen = false;
		} catch {
			deletionFailed = true;
			await tick();
			deleteFeedback?.focus();
		} finally {
			pending = null;
		}
	}

	async function copyUrl() {
		try {
			await navigator.clipboard.writeText(webhookUrl);
			copyFeedback = m.common_copied();
		} catch {
			urlField?.focus();
			urlField?.select();
			copyFeedback = m.issue_tracker_copy_manual();
		}
	}

	function restoreFocus(event: Event) {
		event.preventDefault();
		(deleteTrigger?.isConnected ? deleteTrigger : providerControl)?.focus();
	}
</script>

<div class="space-y-4">
	<PageHeader title={m.issue_tracker_title()} description={m.issue_tracker_desc()} />

	<form onsubmit={handleSave} class="space-y-4 rounded-xl border bg-card p-4 sm:p-6">
		{#if feedback?.error}
			<p
				id="it-error"
				role="alert"
				tabindex="-1"
				bind:this={formFeedback}
				class="rounded-md border border-destructive/40 p-3 text-sm text-destructive"
			>
				{feedback.message}
			</p>
		{/if}
		<fieldset disabled={pending !== null} class="min-w-0 space-y-4">
			<div class="space-y-1">
				<label for="it-provider" class="block text-sm font-medium"
					>{m.issue_tracker_provider()}</label
				>
				<select
					id="it-provider"
					bind:this={providerControl}
					bind:value={provider}
					onchange={providerChanged}
					class="h-10 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-2 focus-visible:outline-ring"
				>
					{#each PROVIDERS as item (item)}
						<option value={item}>{settings[item].label()}</option>
					{/each}
				</select>
			</div>
			<div
				class={connection.address && connection.key ? 'grid gap-4 lg:grid-cols-2' : 'grid gap-4'}
			>
				{#if connection.address}
					<div class="min-w-0 space-y-1">
						<label for="it-address" class="block text-sm font-medium">{connection.address()}</label>
						<Input
							id="it-address"
							type="url"
							placeholder={connection.sample}
							bind:value={draft.endpoint}
							required
						/>
					</div>
				{/if}
				{#if connection.key}
					<div class="min-w-0 space-y-1">
						<label for="it-key" class="block text-sm font-medium">{connection.key()}</label>
						<Input
							id="it-key"
							placeholder={connection.keySample}
							bind:value={draft.key}
							required
							aria-invalid={invalidField === 'key' || undefined}
							aria-describedby={invalidField === 'key' ? 'it-error' : undefined}
						/>
					</div>
				{/if}
			</div>
			<div class="space-y-1">
				<label for="it-token" class="block text-sm font-medium">{m.issue_tracker_api_token()}</label
				>
				<Input
					id="it-token"
					type="password"
					autocomplete="new-password"
					bind:value={apiToken}
					required={!savedToken && provider !== 'CUSTOM'}
					aria-invalid={invalidField === 'token' || undefined}
					aria-describedby={invalidField === 'token'
						? 'it-error'
						: provider === 'JIRA' || savedToken
							? 'it-token-hint'
							: undefined}
				/>
				{#if provider === 'JIRA' || savedToken}
					<p id="it-token-hint" class="text-sm text-muted-foreground">
						{#if provider === 'JIRA'}<span class="block">{m.issue_tracker_jira_token_format()}</span
							>{/if}
						{#if savedToken}<span class="block">{m.issue_tracker_keep_token()}</span>{/if}
					</p>
				{/if}
			</div>

			{#if provider === 'CUSTOM'}
				<div class="space-y-1">
					<label for="it-headers" class="block text-sm font-medium"
						>{m.issue_tracker_custom_headers()}</label
					>
					<Textarea
						id="it-headers"
						placeholder={'{"X-Custom-Header": "value"}'}
						bind:value={customHeaders}
						rows={3}
						aria-invalid={invalidField === 'headers' || undefined}
						aria-describedby={invalidField === 'headers' ? 'it-error' : undefined}
					/>
				</div>
			{:else}
				<section aria-labelledby="it-webhook-heading" class="space-y-3 border-t pt-4">
					<div>
						<h3 id="it-webhook-heading" class="font-medium">{m.issue_tracker_webhook_title()}</h3>
						<p class="text-sm text-muted-foreground">{m.issue_tracker_webhook_desc()}</p>
					</div>
					<div class="space-y-1">
						<label for="it-webhook-url" class="block text-sm font-medium"
							>{m.issue_tracker_webhook_url()}</label
						>
						<div class="flex flex-wrap items-center gap-2">
							<div class="min-w-0 flex-1 basis-48">
								<Input id="it-webhook-url" bind:ref={urlField} readonly value={webhookUrl} />
							</div>
							<Button type="button" variant="outline" onclick={copyUrl}
								>{m.issue_tracker_copy_url()}</Button
							>
						</div>
						{#if copyFeedback}<p role="status" class="text-sm text-muted-foreground">
								{copyFeedback}
							</p>{/if}
					</div>
					<div class="space-y-1">
						<label for="it-webhook-secret" class="block text-sm font-medium"
							>{m.issue_tracker_webhook_secret()}</label
						>
						<Input
							id="it-webhook-secret"
							type="password"
							autocomplete="new-password"
							bind:value={webhookSecret}
							placeholder={savedSecret ? '••••••••' : m.issue_tracker_webhook_secret_placeholder()}
						/>
					</div>
					<p class="text-sm text-muted-foreground">{m.issue_tracker_webhook_hint()}</p>
				</section>
			{/if}
		</fieldset>

		<div class="flex flex-wrap gap-2">
			<Button type="submit" disabled={pending !== null} class="w-full sm:w-auto">
				{pending === 'save' ? m.common_saving() : m.issue_tracker_save()}
			</Button>
			{#if config && sameProvider}
				<Button
					type="button"
					variant="outline"
					disabled={pending !== null}
					onclick={handleTest}
					aria-describedby="it-test-hint"
					class="w-full sm:w-auto"
				>
					{pending === 'test' ? m.common_loading() : m.issue_tracker_test()}
				</Button>
			{/if}
			{#if config}
				<Button
					type="button"
					variant="outline"
					class="w-full text-destructive sm:w-auto"
					bind:ref={deleteTrigger}
					disabled={pending !== null}
					onclick={() => {
						deletionFailed = false;
						deleteOpen = true;
					}}>{m.common_delete()}</Button
				>
			{/if}
		</div>
		{#if config && sameProvider}
			<p id="it-test-hint" class="text-sm text-muted-foreground">{m.issue_tracker_test_saved()}</p>
		{/if}
		{#if feedback && !feedback.error}
			<p role="status" class="text-sm text-muted-foreground">{feedback.message}</p>
		{/if}
	</form>

	<AlertDialog.Root bind:open={deleteOpen}>
		<AlertDialog.Content
			onCloseAutoFocus={restoreFocus}
			escapeKeydownBehavior={pending === 'delete' ? 'ignore' : 'close'}
		>
			<AlertDialog.Header>
				<AlertDialog.Title>{m.issue_tracker_delete_title()}</AlertDialog.Title>
				<AlertDialog.Description>{m.issue_tracker_delete_confirm()}</AlertDialog.Description>
			</AlertDialog.Header>
			{#if deletionFailed}<p
					role="alert"
					tabindex="-1"
					bind:this={deleteFeedback}
					class="text-sm text-destructive"
				>
					{m.error_remove_failed()}
				</p>{/if}
			<AlertDialog.Footer>
				<AlertDialog.Cancel disabled={pending !== null}>{m.common_cancel()}</AlertDialog.Cancel>
				<Button
					type="button"
					variant="destructive"
					disabled={pending !== null}
					onclick={handleDelete}
					class="w-full sm:w-auto"
				>
					{pending === 'delete' ? m.common_saving() : m.common_delete()}
				</Button>
			</AlertDialog.Footer>
		</AlertDialog.Content>
	</AlertDialog.Root>
</div>
