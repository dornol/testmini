<script lang="ts">
	import { tick, untrack } from 'svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { apiFetch } from '$lib/api-client';
	import * as m from '$lib/paraglide/messages.js';
	import { toast } from 'svelte-sonner';

	type Share = { id: number; name: string; expiresAt: string | null };
	let {
		open = $bindable(false),
		endpoint,
		config,
		canManage
	}: {
		open: boolean;
		endpoint: string;
		config: { from?: string; to?: string; preset?: 'all_time' };
		canManage: boolean;
	} = $props();

	let links = $state<Share[]>([]);
	let created = $state<{ id: number; url: string } | null>(null);
	let name = $state('');
	let days = $state<number | undefined>();
	let loading = $state(false);
	let loadFailed = $state(false);
	let saving = $state(false);
	let message = $state('');
	let feedback = $state<HTMLElement>();
	let urlInput = $state<HTMLInputElement | null>(null);

	$effect(() => {
		if (open) untrack(loadLinks);
		else {
			// A share token is only available in the response that creates it.
			created = null;
			message = '';
		}
	});

	async function loadLinks() {
		if (loading) return;
		loadFailed = false;
		loading = true;
		try {
			links = await apiFetch<Share[]>(endpoint, { silent: true });
		} catch {
			loadFailed = true;
		} finally {
			loading = false;
		}
	}

	async function createLink(event: SubmitEvent) {
		event.preventDefault();
		if (saving || loading || loadFailed) return;
		const trimmed = name.trim();
		if (!trimmed) {
			await showError(m.ui_name_required());
			return;
		}
		message = '';
		saving = true;
		try {
			const result = await apiFetch<Share & { token: string }>(endpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: trimmed, config, expiresInDays: days || undefined }),
				silent: true
			});
			const { token, ...link } = result;
			links = [...links, link];
			created = { id: link.id, url: new URL('/shared/' + token, window.location.origin).href };
			name = '';
			days = undefined;
			toast.success(m.report_share_created());
			await tick();
			urlInput?.focus();
		} catch {
			await showError(m.ui_save_failed());
		} finally {
			saving = false;
		}
	}

	async function revoke(id: number) {
		if (saving || loading) return;
		saving = true;
		message = '';
		try {
			await apiFetch(endpoint + '/' + id, { method: 'DELETE', silent: true });
			links = links.filter((link) => link.id !== id);
			if (created?.id === id) created = null;
			toast.success(m.report_share_revoked());
		} catch {
			await showError(m.ui_load_failed_description());
		} finally {
			saving = false;
		}
	}

	async function showError(text: string) {
		message = text;
		await tick();
		feedback?.focus();
	}

	async function copyLink() {
		if (!created) return;
		try {
			await navigator.clipboard.writeText(created.url);
			toast.success(m.report_share_copied());
		} catch {
			message = m.report_share_copy_manually();
			urlInput?.focus();
			urlInput?.select();
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content
		class="sm:max-w-lg"
		showCloseButton={!saving}
		escapeKeydownBehavior={saving ? 'ignore' : 'close'}
		interactOutsideBehavior="ignore"
	>
		<Dialog.Header>
			<Dialog.Title>{m.report_share()}</Dialog.Title>
			<Dialog.Description>{m.report_share_description()}</Dialog.Description>
		</Dialog.Header>
		{#if message}<p
				role="alert"
				tabindex="-1"
				bind:this={feedback}
				class="text-sm text-destructive"
			>
				{message}
			</p>{/if}
		{#if canManage}
			<form onsubmit={createLink} aria-busy={saving} class="space-y-3">
				<fieldset disabled={saving || loading || loadFailed} class="min-w-0 space-y-3">
					<div class="space-y-1">
						<label for="share-name" class="text-sm font-medium">{m.report_share_name()}</label>
						<Input id="share-name" bind:value={name} maxlength={120} required />
					</div>
					<div class="space-y-1">
						<label for="share-expires" class="text-sm font-medium">{m.report_share_expires()}</label
						>
						<Input
							id="share-expires"
							type="number"
							min="0"
							max="365"
							step="1"
							bind:value={days}
							aria-describedby="share-expiration-hint"
						/>
						<p id="share-expiration-hint" class="text-xs text-muted-foreground">
							0–365 · 0: {m.report_share_never_expires()}
						</p>
					</div>
					<Button type="submit" class="w-full sm:w-auto"
						>{saving ? m.common_saving() : m.report_share()}</Button
					>
				</fieldset>
			</form>
		{/if}
		{#if created}
			<div class="space-y-2 rounded-md border p-3">
				<label for="new-share-url" class="text-sm font-medium">{m.report_share_created()}</label>
				<Input id="new-share-url" bind:ref={urlInput} value={created.url} readonly />
				<Button variant="outline" onclick={copyLink}>{m.report_share_copy()}</Button>
			</div>
		{/if}
		{#if loading}
			<p role="status" class="text-sm text-muted-foreground">{m.common_loading()}</p>
		{:else if loadFailed}
			<div class="space-y-2">
				<p role="alert" class="text-sm text-destructive">{m.ui_load_failed()}</p>
				<Button variant="outline" disabled={saving} onclick={loadLinks}>{m.my_work_retry()}</Button>
			</div>
		{:else if !links.length}
			<p class="text-sm text-muted-foreground">{m.report_share_empty()}</p>
		{:else}
			<ul class="divide-y border-t">
				{#each links as link (link.id)}
					<li class="flex flex-wrap items-center justify-between gap-2 py-3">
						<div class="min-w-0 [overflow-wrap:anywhere]">
							<p class="text-sm font-medium">{link.name}</p>
							<p class="text-xs text-muted-foreground">
								{link.expiresAt
									? m.common_expires({ date: new Date(link.expiresAt).toLocaleDateString() })
									: m.report_share_never_expires()}
							</p>
						</div>
						{#if canManage}<Button
								variant="outline"
								disabled={saving}
								onclick={() => revoke(link.id)}
								>{m.report_share_revoke()}<span class="sr-only"> {link.name}</span></Button
							>{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</Dialog.Content>
</Dialog.Root>
