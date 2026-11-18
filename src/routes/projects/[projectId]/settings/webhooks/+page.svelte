<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { apiFetch } from '$lib/api-client';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import PageHeader from '$lib/components/patterns/PageHeader.svelte';
	import * as m from '$lib/paraglide/messages.js';
	import { getLocale } from '$lib/paraglide/runtime';

	let { data } = $props();
	type Webhook = Omit<(typeof data.webhooks)[number], 'createdAt'>;
	type DeliveryLog = {
		id: number;
		event: string;
		statusCode: number | null;
		success: boolean;
		errorMessage: string | null;
		attempt: number;
		duration: number | null;
		createdAt: string;
	};
	const events = {
		TEST_RUN_COMPLETED: m.webhook_event_TEST_RUN_COMPLETED,
		TEST_FAILED: m.webhook_event_TEST_FAILED,
		COMMENT_ADDED: m.webhook_event_COMMENT_ADDED,
		MEMBER_ADDED: m.webhook_event_MEMBER_ADDED,
		ASSIGNED: m.webhook_event_ASSIGNED
	};
	const endpoint = $derived(`/api/projects/${data.project.id}/webhooks`);
	let webhooks = $state<Webhook[]>(untrack(() => data.webhooks));
	let createOpen = $state(false);
	let name = $state('');
	let url = $state('');
	let secret = $state('');
	let selectedEvents = $state<string[]>([]);
	let pending = $state<'create' | 'delete' | 'test' | 'toggle' | null>(null);
	let workingWebhook = $state<number | null>(null);
	let createError = $state<string | null>(null);
	let invalidName = $state(false);
	let rowFeedback = $state<{ id: number; message: string; error?: boolean } | null>(null);
	let deletedMessage = $state(false);
	let deleteTarget = $state<Webhook | null>(null);
	let deleteOpen = $state(false);
	let deleteFailed = $state(false);
	let deleteTrigger: HTMLElement | null = null;
	let addButton = $state<HTMLButtonElement | null>(null);
	let nameField = $state<HTMLInputElement | null>(null);
	let createAlert = $state<HTMLElement | null>(null);
	let deleteAlert = $state<HTMLElement | null>(null);

	let expanded = $state<number | null>(null);
	let logs = $state<DeliveryLog[]>([]);
	let logState = $state<'loading' | 'ready' | 'error'>('ready');
	let logHeading = $state<HTMLElement | null>(null);
	let logRequest: AbortController | null = null;
	$effect(() => () => logRequest?.abort());

	function request<T>(method: 'POST' | 'PATCH' | 'DELETE', suffix = '', body?: object) {
		return apiFetch<T>(endpoint + suffix, {
			method,
			silent: true,
			...(body && { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
		});
	}

	async function openCreate() {
		deletedMessage = false;
		createOpen = true;
		await tick();
		nameField?.focus();
	}

	async function closeCreate() {
		createOpen = false;
		createError = null;
		invalidName = false;
		name = '';
		url = '';
		secret = '';
		selectedEvents = [];
		await tick();
		addButton?.focus();
	}

	async function handleCreate(event: SubmitEvent) {
		event.preventDefault();
		if (pending) return;
		createError = null;
		invalidName = !name.trim();
		if (invalidName) {
			createError = m.settings_catalog_name_required();
			await tick();
			createAlert?.focus();
			return;
		}
		pending = 'create';
		try {
			const created = await request<Webhook>('POST', '', {
				name: name.trim(),
				url: url.trim(),
				secret: secret.trim() || undefined,
				events: selectedEvents
			});
			webhooks = [created, ...webhooks];
			rowFeedback = { id: created.id, message: m.webhook_created() };
			pending = null;
			await closeCreate();
		} catch {
			createError = m.ui_save_failed();
			await tick();
			createAlert?.focus();
		} finally {
			pending = null;
		}
	}

	async function updateWebhook(webhook: Webhook, action: 'toggle' | 'test') {
		if (pending) return;
		pending = action;
		workingWebhook = webhook.id;
		const previousLogRequest = logRequest;
		rowFeedback = null;
		try {
			if (action === 'toggle') {
				const updated = await request<Webhook>('PATCH', '/' + webhook.id, {
					enabled: !webhook.enabled
				});
				webhooks = webhooks.map((item) => (item.id === webhook.id ? updated : item));
				rowFeedback = { id: webhook.id, message: m.webhook_updated() };
			} else {
				await request('POST', '/' + webhook.id + '/test', {});
				rowFeedback = { id: webhook.id, message: m.webhook_test_processed() };
				if (expanded === webhook.id || (expanded === null && logRequest === previousLogRequest))
					void loadLogs(webhook.id);
			}
		} catch {
			rowFeedback = {
				id: webhook.id,
				message: action === 'test' ? m.webhook_test_failed() : m.error_update_failed(),
				error: true
			};
		} finally {
			pending = null;
			workingWebhook = null;
		}
	}

	function openDelete(webhook: Webhook, trigger: HTMLElement) {
		deleteTarget = webhook;
		deleteTrigger = trigger;
		deleteFailed = false;
		deleteOpen = true;
	}

	async function handleDelete() {
		if (!deleteTarget || pending) return;
		const id = deleteTarget.id;
		pending = 'delete';
		deleteFailed = false;
		try {
			await request('DELETE', '/' + id);
			webhooks = webhooks.filter((webhook) => webhook.id !== id);
			if (expanded === id) closeLogs();
			deletedMessage = true;
			deleteOpen = false;
		} catch {
			deleteFailed = true;
			await tick();
			deleteAlert?.focus();
		} finally {
			pending = null;
		}
	}

	function restoreDeleteFocus(event: Event) {
		event.preventDefault();
		(deleteTrigger?.isConnected ? deleteTrigger : (addButton ?? nameField))?.focus();
	}

	function closeLogs() {
		logRequest?.abort();
		logRequest = null;
		expanded = null;
	}

	async function loadLogs(id: number) {
		logRequest?.abort();
		const request = new AbortController();
		logRequest = request;
		expanded = id;
		logState = 'loading';
		try {
			const entries = await apiFetch<DeliveryLog[]>(`${endpoint}/${id}/logs`, {
				silent: true,
				signal: request.signal
			});
			if (!request.signal.aborted) {
				logs = entries;
				logState = 'ready';
			}
		} catch {
			if (!request.signal.aborted) logState = 'error';
		}
	}

	function eventLabel(event: string) {
		if (event === 'TEST') return m.webhook_test();
		return events[event as keyof typeof events]?.() ?? event;
	}

	function formatDuration(ms: number | null) {
		if (ms === null) return '—';
		return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
	}
</script>

<div class="space-y-4">
	<PageHeader title={m.webhook_title()} description={m.webhook_desc()}>
		{#snippet actions()}
			{#if !createOpen}
				<Button
					bind:ref={addButton}
					class="w-full sm:w-auto"
					disabled={pending !== null}
					onclick={openCreate}>{m.webhook_new()}</Button
				>
			{/if}
		{/snippet}
	</PageHeader>

	{#if createOpen}
		<form
			aria-label={m.webhook_new()}
			onsubmit={handleCreate}
			class="space-y-4 rounded-xl border bg-card p-4 sm:p-6"
		>
			{#if createError}<p
					role="alert"
					id="webhook-create-error"
					tabindex="-1"
					bind:this={createAlert}
					class="rounded-md border border-destructive/40 p-3 text-sm text-destructive"
				>
					{createError}
				</p>{/if}
			<fieldset disabled={pending !== null} class="min-w-0 space-y-4">
				<div class="grid gap-4 lg:grid-cols-2">
					<div class="min-w-0 space-y-1">
						<label for="wh-name" class="block text-sm font-medium">{m.webhook_name()}</label>
						<Input
							id="wh-name"
							bind:ref={nameField}
							bind:value={name}
							placeholder={m.webhook_name_placeholder()}
							required
							aria-invalid={invalidName || undefined}
							aria-describedby={invalidName ? 'webhook-create-error' : undefined}
						/>
					</div>
					<div class="min-w-0 space-y-1">
						<label for="wh-url" class="block text-sm font-medium">{m.webhook_url()}</label>
						<Input
							id="wh-url"
							type="url"
							bind:value={url}
							placeholder={m.webhook_url_placeholder()}
							required
						/>
					</div>
				</div>
				<div class="space-y-1">
					<label for="wh-secret" class="block text-sm font-medium">{m.webhook_secret()}</label>
					<Input
						id="wh-secret"
						type="password"
						autocomplete="new-password"
						bind:value={secret}
						placeholder={m.webhook_secret_placeholder()}
					/>
				</div>
				<fieldset aria-describedby="wh-events-hint" class="min-w-0">
					<legend class="text-sm font-medium">{m.webhook_events()}</legend>
					<p id="wh-events-hint" class="mt-1 text-sm text-muted-foreground">
						{m.webhook_events_hint()}
					</p>
					<div class="mt-2 flex flex-wrap gap-x-4 gap-y-1">
						{#each Object.keys(events) as event (event)}
							<label class="flex min-h-9 min-w-0 items-center gap-2 text-sm">
								<input
									type="checkbox"
									bind:group={selectedEvents}
									value={event}
									class="size-4 shrink-0 accent-primary"
								/>
								{eventLabel(event)}
							</label>
						{/each}
					</div>
				</fieldset>
			</fieldset>
			<div class="flex flex-wrap gap-2">
				<Button type="submit" disabled={pending !== null} class="w-full sm:w-auto"
					>{pending === 'create' ? m.common_creating() : m.webhook_new()}</Button
				>
				<Button
					type="button"
					variant="outline"
					disabled={pending !== null}
					class="w-full sm:w-auto"
					onclick={closeCreate}>{m.common_cancel()}</Button
				>
			</div>
		</form>
	{/if}

	{#if deletedMessage}<p role="status" class="text-sm text-muted-foreground">
			{m.webhook_deleted()}
		</p>{/if}
	{#if webhooks.length === 0}
		<p class="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
			{m.webhook_empty()}
		</p>
	{:else}
		<ul aria-label={m.webhook_title()} class="space-y-3">
			{#each webhooks as webhook (webhook.id)}
				{@const showLogs = expanded === webhook.id}
				<li class="min-w-0 rounded-xl border bg-card p-4" aria-busy={workingWebhook === webhook.id}>
					<div class="flex flex-wrap items-start justify-between gap-4">
						<div class="min-w-0 basis-full space-y-1 [overflow-wrap:anywhere] lg:flex-1">
							<h3 class="font-medium">{webhook.name}</h3>
							<p class="text-sm text-muted-foreground">{webhook.url}</p>
							<p class="text-sm text-muted-foreground">
								{webhook.events.length
									? webhook.events.map(eventLabel).join(', ')
									: m.webhook_events_all()}
							</p>
						</div>
						<div class="flex flex-wrap gap-2">
							<Button
								type="button"
								variant="outline"
								size="sm"
								aria-expanded={showLogs}
								aria-controls={showLogs ? `webhook-logs-${webhook.id}` : undefined}
								onclick={() => (showLogs ? closeLogs() : loadLogs(webhook.id))}
								>{m.webhook_logs_show()}</Button
							>
							<Button
								type="button"
								variant="outline"
								size="sm"
								disabled={pending !== null || !webhook.enabled}
								onclick={() => updateWebhook(webhook, 'test')}
								>{pending === 'test' && workingWebhook === webhook.id
									? m.common_loading()
									: m.webhook_test()}</Button
							>
							<Button
								type="button"
								role="switch"
								aria-checked={webhook.enabled}
								aria-label={m.webhook_enabled()}
								variant={webhook.enabled ? 'default' : 'outline'}
								size="sm"
								disabled={pending !== null}
								onclick={() => updateWebhook(webhook, 'toggle')}
								>{webhook.enabled ? m.common_active() : m.common_inactive()}</Button
							>
							<Button
								type="button"
								variant="outline"
								size="sm"
								disabled={pending !== null}
								aria-label={m.settings_catalog_item_action({
									name: webhook.name,
									action: m.common_delete()
								})}
								onclick={(event) => openDelete(webhook, event.currentTarget)}
								>{m.common_delete()}</Button
							>
						</div>
					</div>
					{#if rowFeedback?.id === webhook.id}
						<p
							role={rowFeedback.error ? 'alert' : 'status'}
							class="mt-3 text-sm {rowFeedback.error
								? 'text-destructive'
								: 'text-muted-foreground'}"
						>
							{rowFeedback.message}
						</p>
					{/if}
					{#if showLogs}
						<section
							id={`webhook-logs-${webhook.id}`}
							aria-labelledby={`webhook-log-title-${webhook.id}`}
							class="mt-4 space-y-2 border-t pt-4"
						>
							<h4
								id={`webhook-log-title-${webhook.id}`}
								tabindex="-1"
								bind:this={logHeading}
								class="text-sm font-medium"
							>
								{m.webhook_logs()}
							</h4>
							{#if logState === 'loading'}
								<p role="status" class="text-sm text-muted-foreground">{m.common_loading()}</p>
							{:else if logState === 'error'}
								<p role="alert" class="text-sm text-destructive">
									{m.webhook_logs_failed_to_load()}
								</p>
								<Button
									type="button"
									variant="outline"
									size="sm"
									onclick={() => {
										logHeading?.focus();
										void loadLogs(webhook.id);
									}}>{m.my_work_retry()}</Button
								>
							{:else if logs.length === 0}
								<p class="text-sm text-muted-foreground">{m.webhook_logs_empty()}</p>
							{:else}
								<p class="text-sm text-muted-foreground">{m.webhook_logs_retry_info()}</p>
								<ul class="space-y-2">
									{#each logs as log (log.id)}
										<li class="space-y-1 rounded-md border p-3 text-sm [overflow-wrap:anywhere]">
											<div class="flex flex-wrap items-start justify-between gap-2">
												<span class="font-medium">{eventLabel(log.event)}</span>
												<span class={log.success ? 'font-medium' : 'font-medium text-destructive'}>
													{log.success ? m.webhook_logs_success() : m.webhook_logs_failed()}
													{log.statusCode ?? ''}
												</span>
											</div>
											<dl class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
												<div class="flex gap-1">
													<dt>{m.webhook_logs_time()}</dt>
													<dd>
														<time datetime={log.createdAt}
															>{new Date(log.createdAt).toLocaleString(getLocale(), {
																timeZoneName: 'short'
															})}</time
														>
													</dd>
												</div>
												<div class="flex gap-1">
													<dt>{m.webhook_logs_attempt()}</dt>
													<dd>{log.attempt}/3</dd>
												</div>
												<div class="flex gap-1">
													<dt>{m.webhook_logs_duration()}</dt>
													<dd>{formatDuration(log.duration)}</dd>
												</div>
											</dl>
											{#if log.errorMessage}<p class="text-xs text-destructive">
													{log.errorMessage}
												</p>{/if}
										</li>
									{/each}
								</ul>
							{/if}
						</section>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>

<AlertDialog.Root bind:open={deleteOpen}>
	{#if deleteTarget}
		<AlertDialog.Content
			onCloseAutoFocus={restoreDeleteFocus}
			escapeKeydownBehavior={pending === 'delete' ? 'ignore' : 'close'}
		>
			<AlertDialog.Header>
				<AlertDialog.Title>{m.webhook_delete_title()}</AlertDialog.Title>
				<AlertDialog.Description class="[overflow-wrap:anywhere]"
					>{m.webhook_delete_confirm({ name: deleteTarget.name })}</AlertDialog.Description
				>
			</AlertDialog.Header>
			{#if deleteFailed}<p
					role="alert"
					tabindex="-1"
					bind:this={deleteAlert}
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
					>{pending === 'delete' ? m.common_saving() : m.common_delete()}</Button
				>
			</AlertDialog.Footer>
		</AlertDialog.Content>
	{/if}
</AlertDialog.Root>
