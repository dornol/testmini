<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { toast } from 'svelte-sonner';
	import { apiFetch, apiPost, apiPatch, apiDelete } from '$lib/api-client';
	import * as m from '$lib/paraglide/messages.js';

	interface Webhook {
		id: number;
		name: string;
		url: string;
		events: string[];
		enabled: boolean;
		createdAt: string | Date;
	}

	interface DeliveryLog {
		id: number;
		event: string;
		statusCode: number | null;
		success: boolean;
		errorMessage: string | null;
		attempt: number;
		duration: number | null;
		createdAt: string | Date;
	}

	const EVENT_TYPES = [
		'TEST_RUN_COMPLETED',
		'TEST_FAILED',
		'COMMENT_ADDED',
		'MEMBER_ADDED',
		'ASSIGNED'
	] as const;

	let { data } = $props();

	const projectId = $derived(data.project.id);

	let webhooks = $state<Webhook[]>([]);

	// Sync from data (reactive)
	$effect(() => {
		webhooks = data.webhooks as Webhook[];
	});

	// Create form
	let showCreateForm = $state(false);
	let newName = $state('');
	let newUrl = $state('');
	let newSecret = $state('');
	let newEvents = $state<string[]>([]);
	let creating = $state(false);

	// Delete dialog
	let deleteWebhook = $state<Webhook | null>(null);

	// Delivery logs
	let expandedWebhookId = $state<number | null>(null);
	let deliveryLogs = $state<DeliveryLog[]>([]);
	let loadingLogs = $state(false);

	function eventLabel(event: string): string {
		const labels: Record<string, () => string> = {
			TEST_RUN_COMPLETED: m.webhook_event_TEST_RUN_COMPLETED,
			TEST_FAILED: m.webhook_event_TEST_FAILED,
			COMMENT_ADDED: m.webhook_event_COMMENT_ADDED,
			MEMBER_ADDED: m.webhook_event_MEMBER_ADDED,
			ASSIGNED: m.webhook_event_ASSIGNED
		};
		return labels[event]?.() ?? event;
	}

	function toggleEvent(event: string) {
		if (newEvents.includes(event)) {
			newEvents = newEvents.filter((e) => e !== event);
		} else {
			newEvents = [...newEvents, event];
		}
	}

	async function handleCreate() {
		if (creating) return;
		creating = true;
		try {
			const created = await apiPost<Webhook>(`/api/projects/${projectId}/webhooks`, {
				name: newName.trim(),
				url: newUrl.trim(),
				secret: newSecret.trim() || undefined,
				events: newEvents
			});
			webhooks = [created, ...webhooks];
			toast.success(m.webhook_created());
			resetForm();
		} catch {
			// apiPost handles toast
		} finally {
			creating = false;
		}
	}

	function resetForm() {
		showCreateForm = false;
		newName = '';
		newUrl = '';
		newSecret = '';
		newEvents = [];
	}

	async function handleToggleEnabled(webhook: Webhook) {
		try {
			await apiPatch(`/api/projects/${projectId}/webhooks/${webhook.id}`, {
				enabled: !webhook.enabled
			});
			webhooks = webhooks.map((w) =>
				w.id === webhook.id ? { ...w, enabled: !w.enabled } : w
			);
			toast.success(m.webhook_updated());
		} catch {
			// handled
		}
	}

	async function handleDelete() {
		if (!deleteWebhook) return;
		const id = deleteWebhook.id;
		try {
			await apiDelete(`/api/projects/${projectId}/webhooks/${id}`);
			webhooks = webhooks.filter((w) => w.id !== id);
			if (expandedWebhookId === id) expandedWebhookId = null;
			toast.success(m.webhook_deleted());
		} catch {
			// handled
		} finally {
			deleteWebhook = null;
		}
	}

	async function handleTest(webhook: Webhook) {
		try {
			await apiPost(`/api/projects/${projectId}/webhooks/${webhook.id}/test`, {});
			toast.success(m.webhook_test_sent());
			// Refresh logs if this webhook's logs are expanded
			if (expandedWebhookId === webhook.id) {
				await loadDeliveryLogs(webhook.id);
			}
		} catch {
			// handled
		}
	}

	async function toggleLogs(webhookId: number) {
		if (expandedWebhookId === webhookId) {
			expandedWebhookId = null;
			return;
		}
		await loadDeliveryLogs(webhookId);
	}

	async function loadDeliveryLogs(webhookId: number) {
		loadingLogs = true;
		expandedWebhookId = webhookId;
		try {
			deliveryLogs = await apiFetch<DeliveryLog[]>(
				`/api/projects/${projectId}/webhooks/${webhookId}/logs`
			);
		} catch {
			deliveryLogs = [];
		} finally {
			loadingLogs = false;
		}
	}

	function formatTime(date: string | Date): string {
		return new Date(date).toLocaleString();
	}

	function formatDuration(ms: number | null): string {
		if (ms === null) return '-';
		if (ms < 1000) return `${ms}ms`;
		return `${(ms / 1000).toFixed(1)}s`;
	}
</script>

<div class="space-y-4">
	<div>
		<h3 class="text-lg font-semibold">{m.webhook_title()}</h3>
		<p class="text-muted-foreground text-sm">{m.webhook_desc()}</p>
		<p class="text-muted-foreground mt-1 text-xs">{m.webhook_logs_retry_info()}</p>
	</div>

	{#if !showCreateForm}
		<Button onclick={() => (showCreateForm = true)}>{m.webhook_new()}</Button>
	{:else}
		<Card.Root>
			<Card.Header>
				<Card.Title class="text-base">{m.webhook_new()}</Card.Title>
			</Card.Header>
			<Card.Content>
				<form
					onsubmit={(e) => {
						e.preventDefault();
						handleCreate();
					}}
					class="space-y-4"
				>
					<div class="grid gap-4 sm:grid-cols-2">
						<div class="space-y-2">
							<Label for="wh-name">{m.webhook_name()}</Label>
							<Input
								id="wh-name"
								placeholder={m.webhook_name_placeholder()}
								bind:value={newName}
								required
							/>
						</div>
						<div class="space-y-2">
							<Label for="wh-url">{m.webhook_url()}</Label>
							<Input
								id="wh-url"
								type="url"
								placeholder={m.webhook_url_placeholder()}
								bind:value={newUrl}
								required
							/>
						</div>
					</div>

					<div class="space-y-2">
						<Label for="wh-secret">{m.webhook_secret()}</Label>
						<Input
							id="wh-secret"
							placeholder={m.webhook_secret_placeholder()}
							bind:value={newSecret}
						/>
					</div>

					<div class="space-y-2">
						<Label>{m.webhook_events()}</Label>
						<p class="text-muted-foreground text-xs">
							{m.webhook_events_all()}
						</p>
						<div class="flex flex-wrap gap-3">
							{#each EVENT_TYPES as event (event)}
								<label class="flex items-center gap-1.5 text-sm">
									<Checkbox
										checked={newEvents.includes(event)}
										onCheckedChange={() => toggleEvent(event)}
									/>
									{eventLabel(event)}
								</label>
							{/each}
						</div>
					</div>

					<div class="flex gap-2">
						<Button type="submit" disabled={creating || !newName.trim() || !newUrl.trim()}>
							{m.webhook_new()}
						</Button>
						<Button type="button" variant="outline" onclick={resetForm}>
							{m.common_cancel()}
						</Button>
					</div>
				</form>
			</Card.Content>
		</Card.Root>
	{/if}

	{#if webhooks.length === 0}
		<div class="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
			<p class="text-muted-foreground text-sm">{m.webhook_empty()}</p>
		</div>
	{:else}
		<Card.Root>
			<Card.Content class="pt-6">
				<div class="space-y-3">
					{#each webhooks as webhook (webhook.id)}
						<div class="rounded-md border {webhook.enabled ? '' : 'opacity-50'}">
							<div class="flex items-center justify-between gap-4 px-4 py-3">
								<div class="min-w-0 flex-1">
									<div class="flex items-center gap-2">
										<p class="truncate text-sm font-medium">{webhook.name}</p>
										{#if webhook.events.length > 0}
											<span class="text-muted-foreground text-xs">
												({webhook.events.length} events)
											</span>
										{:else}
											<span class="text-muted-foreground text-xs">
												({m.webhook_events_all()})
											</span>
										{/if}
									</div>
									<p class="truncate text-xs text-muted-foreground">{webhook.url}</p>
								</div>

								<div class="flex shrink-0 items-center gap-2">
									<Button
										variant="outline"
										size="sm"
										onclick={() => toggleLogs(webhook.id)}
									>
										{m.webhook_logs_show()}
									</Button>
									<Button
										variant="outline"
										size="sm"
										onclick={() => handleTest(webhook)}
									>
										{m.webhook_test()}
									</Button>
									<Button
										variant={webhook.enabled ? 'default' : 'outline'}
										size="sm"
										onclick={() => handleToggleEnabled(webhook)}
									>
										{m.webhook_enabled()}
									</Button>
									<Button
										variant="outline"
										size="sm"
										onclick={() => (deleteWebhook = webhook)}
									>
										{m.common_delete()}
									</Button>
								</div>
							</div>

							{#if expandedWebhookId === webhook.id}
								<div class="border-t px-4 py-3">
									<h4 class="mb-2 text-sm font-medium">{m.webhook_logs()}</h4>
									{#if loadingLogs}
										<p class="text-muted-foreground text-xs">...</p>
									{:else if deliveryLogs.length === 0}
										<p class="text-muted-foreground text-xs">{m.webhook_logs_empty()}</p>
									{:else}
										<div class="overflow-x-auto">
											<table class="w-full text-xs">
												<thead>
													<tr class="text-muted-foreground border-b text-left">
														<th class="pb-1.5 pr-3 font-medium">{m.webhook_logs_time()}</th>
														<th class="pb-1.5 pr-3 font-medium">{m.webhook_logs_event()}</th>
														<th class="pb-1.5 pr-3 font-medium">{m.webhook_logs_status()}</th>
														<th class="pb-1.5 pr-3 font-medium">{m.webhook_logs_attempt()}</th>
														<th class="pb-1.5 pr-3 font-medium">{m.webhook_logs_duration()}</th>
														<th class="pb-1.5 font-medium">{m.webhook_logs_error()}</th>
													</tr>
												</thead>
												<tbody>
													{#each deliveryLogs as log (log.id)}
														<tr class="border-b last:border-0">
															<td class="whitespace-nowrap py-1.5 pr-3">{formatTime(log.createdAt)}</td>
															<td class="py-1.5 pr-3">{eventLabel(log.event)}</td>
															<td class="py-1.5 pr-3">
																{#if log.success}
																	<Badge variant="default" class="bg-green-600 text-xs">{log.statusCode ?? m.webhook_logs_success()}</Badge>
																{:else}
																	<Badge variant="destructive" class="text-xs">{log.statusCode ?? m.webhook_logs_failed()}</Badge>
																{/if}
															</td>
															<td class="py-1.5 pr-3">{log.attempt}/3</td>
															<td class="py-1.5 pr-3">{formatDuration(log.duration)}</td>
															<td class="text-destructive max-w-[200px] truncate py-1.5">{log.errorMessage ?? '-'}</td>
														</tr>
													{/each}
												</tbody>
											</table>
										</div>
									{/if}
								</div>
							{/if}
						</div>
					{/each}
				</div>
			</Card.Content>
		</Card.Root>
	{/if}

	<AlertDialog.Root
		open={!!deleteWebhook}
		onOpenChange={(open) => {
			if (!open) deleteWebhook = null;
		}}
	>
		<AlertDialog.Portal>
			<AlertDialog.Overlay />
			<AlertDialog.Content>
				<AlertDialog.Header>
					<AlertDialog.Title>{m.webhook_delete_title()}</AlertDialog.Title>
					<AlertDialog.Description>
						{m.webhook_delete_confirm({ name: deleteWebhook?.name ?? '' })}
					</AlertDialog.Description>
				</AlertDialog.Header>
				<AlertDialog.Footer>
					<AlertDialog.Cancel>{m.common_cancel()}</AlertDialog.Cancel>
					<Button variant="destructive" onclick={handleDelete}>{m.common_delete()}</Button>
				</AlertDialog.Footer>
			</AlertDialog.Content>
		</AlertDialog.Portal>
	</AlertDialog.Root>
</div>
