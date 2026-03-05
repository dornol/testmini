<script lang="ts">
	import { onMount } from 'svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { toast } from 'svelte-sonner';
	import * as m from '$lib/paraglide/messages.js';

	let { data } = $props();

	interface ApiKey {
		id: number;
		name: string;
		prefix: string;
		lastUsedAt: string | null;
		createdAt: string;
	}

	let apiKeys = $state<ApiKey[]>([]);
	let loading = $state(true);
	let generateOpen = $state(false);
	let newKeyName = $state('');
	let generating = $state(false);
	let generatedKey = $state<string | null>(null);
	let generatedKeyName = $state('');
	let revoking = $state(false);

	const projectId = $derived(data.project.id);

	async function loadKeys() {
		loading = true;
		try {
			const res = await fetch(`/api/projects/${projectId}/api-keys`);
			if (res.ok) {
				apiKeys = await res.json();
			}
		} catch {
			toast.error(m.error_operation_failed());
		} finally {
			loading = false;
		}
	}

	onMount(loadKeys);

	async function generateKey() {
		if (!newKeyName.trim()) return;
		generating = true;
		try {
			const res = await fetch(`/api/projects/${projectId}/api-keys`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: newKeyName.trim() })
			});
			if (res.ok) {
				const result = await res.json();
				generatedKey = result.key;
				generatedKeyName = result.name;
				generateOpen = false;
				newKeyName = '';
				await loadKeys();
			} else {
				const err = await res.json();
				toast.error(err.error || m.error_operation_failed());
			}
		} catch {
			toast.error(m.error_operation_failed());
		} finally {
			generating = false;
		}
	}

	async function revokeKey(key: ApiKey) {
		revoking = true;
		try {
			const res = await fetch(`/api/projects/${projectId}/api-keys/${key.id}`, {
				method: 'DELETE'
			});
			if (res.ok) {
				toast.success(m.api_key_revoked());
				await loadKeys();
			} else {
				toast.error(m.error_operation_failed());
			}
		} catch {
			toast.error(m.error_operation_failed());
		} finally {
			revoking = false;
		}
	}

	async function copyKey(key: string) {
		try {
			await navigator.clipboard.writeText(key);
			toast.success(m.api_key_copied());
		} catch {
			toast.error(m.error_operation_failed());
		}
	}

	function formatDate(dateStr: string | null): string {
		if (!dateStr) return '-';
		return new Date(dateStr).toLocaleDateString();
	}
</script>

<div class="space-y-4">
	<Card.Root>
		<Card.Header>
			<div class="flex items-center justify-between">
				<div>
					<Card.Title>{m.api_keys_title()}</Card.Title>
					<Card.Description>{m.api_keys_desc()}</Card.Description>
				</div>
				<Button onclick={() => { generateOpen = true; }}>
					{m.api_key_generate()}
				</Button>
			</div>
		</Card.Header>
		<Card.Content>
			{#if loading}
				<p class="text-muted-foreground text-sm">{m.common_saving()}</p>
			{:else if apiKeys.length === 0}
				<p class="text-muted-foreground text-sm">{m.api_keys_empty()}</p>
			{:else}
				<div class="space-y-3">
					{#each apiKeys as key (key.id)}
						<div class="flex items-center justify-between rounded-md border p-3">
							<div class="min-w-0 flex-1">
								<div class="flex items-center gap-2">
									<span class="text-sm font-medium">{key.name}</span>
									<Badge variant="outline" class="font-mono text-xs">{key.prefix}...</Badge>
								</div>
								<div class="text-muted-foreground mt-1 text-xs">
									{m.common_created()}: {formatDate(key.createdAt)}
									&middot;
									{m.api_key_last_used()}: {formatDate(key.lastUsedAt)}
								</div>
							</div>
							<AlertDialog.Root>
								<AlertDialog.Trigger>
									{#snippet child({ props })}
										<Button variant="destructive" size="sm" {...props}>
											{m.api_key_revoke()}
										</Button>
									{/snippet}
								</AlertDialog.Trigger>
								<AlertDialog.Portal>
									<AlertDialog.Overlay />
									<AlertDialog.Content>
										<AlertDialog.Header>
											<AlertDialog.Title>{m.api_key_revoke_title()}</AlertDialog.Title>
											<AlertDialog.Description>
												{m.api_key_revoke_confirm({ name: key.name })}
											</AlertDialog.Description>
										</AlertDialog.Header>
										<AlertDialog.Footer>
											<AlertDialog.Cancel>{m.common_cancel()}</AlertDialog.Cancel>
											<Button
												variant="destructive"
												disabled={revoking}
												onclick={() => revokeKey(key)}
											>
												{m.api_key_revoke()}
											</Button>
										</AlertDialog.Footer>
									</AlertDialog.Content>
								</AlertDialog.Portal>
							</AlertDialog.Root>
						</div>
					{/each}
				</div>
			{/if}
		</Card.Content>
	</Card.Root>
</div>

<!-- Generate API Key Dialog -->
<Dialog.Root bind:open={generateOpen}>
	<Dialog.Portal>
		<Dialog.Overlay />
		<Dialog.Content>
			<Dialog.Header>
				<Dialog.Title>{m.api_key_generate_title()}</Dialog.Title>
				<Dialog.Description>{m.api_key_generate_desc()}</Dialog.Description>
			</Dialog.Header>
			<div class="space-y-4 py-2">
				<div class="space-y-2">
					<Label for="keyName">{m.api_key_name_label()}</Label>
					<Input
						id="keyName"
						bind:value={newKeyName}
						placeholder={m.api_key_name_placeholder()}
					/>
				</div>
			</div>
			<Dialog.Footer>
				<Button variant="outline" onclick={() => { generateOpen = false; newKeyName = ''; }}>
					{m.common_cancel()}
				</Button>
				<Button disabled={!newKeyName.trim() || generating} onclick={generateKey}>
					{generating ? m.api_key_generating() : m.api_key_generate()}
				</Button>
			</Dialog.Footer>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<!-- Show Generated Key Dialog (one-time display) -->
<Dialog.Root open={!!generatedKey} onOpenChange={(open) => { if (!open) generatedKey = null; }}>
	<Dialog.Portal>
		<Dialog.Overlay />
		<Dialog.Content>
			<Dialog.Header>
				<Dialog.Title>{m.api_key_created_title()}</Dialog.Title>
				<Dialog.Description>{m.api_key_created_desc()}</Dialog.Description>
			</Dialog.Header>
			<div class="space-y-4 py-2">
				<div class="space-y-2">
					<Label>{m.api_key_name_label()}: {generatedKeyName}</Label>
					<div class="flex items-center gap-2">
						<code class="bg-muted flex-1 overflow-x-auto rounded p-2 font-mono text-sm break-all">
							{generatedKey}
						</code>
						<Button variant="outline" size="sm" onclick={() => copyKey(generatedKey!)}>
							{m.api_key_copy()}
						</Button>
					</div>
					<p class="text-muted-foreground text-xs">{m.api_key_copy_warning()}</p>
				</div>
			</div>
			<Dialog.Footer>
				<Button onclick={() => { generatedKey = null; }}>{m.common_close()}</Button>
			</Dialog.Footer>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
