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
	import { apiFetch, apiPost, apiDelete } from '$lib/api-client';

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
	let keyCopied = $state(false);

	const projectId = $derived(data.project.id);

	async function loadKeys() {
		loading = true;
		try {
			apiKeys = await apiFetch<ApiKey[]>(`/api/projects/${projectId}/api-keys`);
		} catch {
			// error toast handled by apiFetch
		} finally {
			loading = false;
		}
	}

	onMount(loadKeys);

	async function generateKey() {
		if (!newKeyName.trim()) return;
		generating = true;
		try {
			const result = await apiPost<{ key: string; name: string }>(`/api/projects/${projectId}/api-keys`, { name: newKeyName.trim() });
			generatedKey = result.key;
			generatedKeyName = result.name;
			keyCopied = false;
			generateOpen = false;
			newKeyName = '';
			await loadKeys();
		} catch {
			// error toast handled by apiPost
		} finally {
			generating = false;
		}
	}

	async function revokeKey(key: ApiKey) {
		revoking = true;
		try {
			await apiDelete(`/api/projects/${projectId}/api-keys/${key.id}`);
			toast.success(m.api_key_revoked());
			await loadKeys();
		} catch {
			// error toast handled by apiDelete
		} finally {
			revoking = false;
		}
	}

	async function copyKey(key: string) {
		try {
			await navigator.clipboard.writeText(key);
			keyCopied = true;
			toast.success(m.api_key_copied());
		} catch {
			toast.error(m.error_operation_failed());
		}
	}

	function tryCloseGeneratedKey(open: boolean) {
		if (open || !generatedKey) return;
		if (!keyCopied) {
			if (!confirm(m.api_key_close_without_copy())) return;
		}
		generatedKey = null;
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
				<p class="text-muted-foreground text-sm">{m.common_loading()}</p>
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
<Dialog.Root open={!!generatedKey} onOpenChange={tryCloseGeneratedKey}>
	<Dialog.Portal>
		<Dialog.Overlay />
		<Dialog.Content>
			<Dialog.Header>
				<Dialog.Title>{m.api_key_created_title()}</Dialog.Title>
				<Dialog.Description>{m.api_key_created_desc()}</Dialog.Description>
			</Dialog.Header>
			<div class="space-y-4 py-2">
				<div class="rounded-md border border-amber-500/50 bg-amber-50 p-3 dark:bg-amber-950/30">
					<p class="text-sm font-medium text-amber-800 dark:text-amber-200">{m.api_key_copy_warning()}</p>
				</div>
				<div class="space-y-2">
					<Label>{m.api_key_name_label()}: {generatedKeyName}</Label>
					<div class="flex items-center gap-2">
						<code class="bg-muted flex-1 overflow-x-auto rounded p-2 font-mono text-sm break-all">
							{generatedKey}
						</code>
						<Button variant={keyCopied ? 'outline' : 'default'} size="sm" onclick={() => copyKey(generatedKey!)}>
							{#if keyCopied}
								<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-1"><path d="M20 6 9 17l-5-5"/></svg>
							{/if}
							{m.api_key_copy()}
						</Button>
					</div>
				</div>
			</div>
			<Dialog.Footer>
				<Button onclick={() => tryCloseGeneratedKey(false)}>{m.common_close()}</Button>
			</Dialog.Footer>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
