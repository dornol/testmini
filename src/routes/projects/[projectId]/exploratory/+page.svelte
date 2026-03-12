<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import * as m from '$lib/paraglide/messages.js';
	import { toast } from 'svelte-sonner';
	import { apiPost } from '$lib/api-client';

	let { data } = $props();

	let showNewDialog = $state(false);
	let newTitle = $state('');
	let newCharter = $state('');
	let newEnvironment = $state('');
	let newTags = $state('');
	let creating = $state(false);

	const projectId = $derived(data.project.id);
	const apiBase = $derived(`/api/projects/${projectId}/exploratory-sessions`);

	let statusFilter = $derived(data.statusFilter);

	function setStatusFilter(status: string) {
		const url = new URL(page.url);
		if (status) {
			url.searchParams.set('status', status);
		} else {
			url.searchParams.delete('status');
		}
		goto(url.toString(), { replaceState: true });
	}

	function statusVariant(status: string): 'default' | 'secondary' | 'outline' | 'destructive' {
		if (status === 'ACTIVE') return 'default';
		if (status === 'PAUSED') return 'secondary';
		return 'outline';
	}

	function statusLabel(status: string): string {
		if (status === 'ACTIVE') return m.exploratory_status_active();
		if (status === 'PAUSED') return m.exploratory_status_paused();
		return m.exploratory_status_completed();
	}

	function formatDuration(session: { startedAt: string | Date; pausedDuration: number; completedAt: string | Date | null; status: string }): string {
		const start = new Date(session.startedAt).getTime();
		const end = session.completedAt ? new Date(session.completedAt).getTime() : Date.now();
		const elapsed = Math.floor((end - start) / 1000) - session.pausedDuration;
		const secs = Math.max(0, elapsed);
		const h = Math.floor(secs / 3600);
		const min = Math.floor((secs % 3600) / 60);
		const s = secs % 60;
		if (h > 0) return `${h}h ${min}m`;
		return `${min}m ${s}s`;
	}

	async function createSession() {
		if (!newTitle.trim()) return;
		creating = true;
		try {
			const session = await apiPost<{ id: number }>(apiBase, {
				title: newTitle.trim(),
				charter: newCharter.trim() || undefined,
				environment: newEnvironment.trim() || undefined,
				tags: newTags.trim() ? newTags.split(',').map((t) => t.trim()).filter(Boolean) : []
			});
			toast.success(m.exploratory_created());
			showNewDialog = false;
			newTitle = '';
			newCharter = '';
			newEnvironment = '';
			newTags = '';
			goto(`/projects/${projectId}/exploratory/${session.id}`);
		} catch {
			// error toast handled by apiPost
		} finally {
			creating = false;
		}
	}
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<h2 class="text-lg font-semibold">{m.exploratory_title()}</h2>
		<Button size="sm" onclick={() => (showNewDialog = true)}>{m.exploratory_new()}</Button>
	</div>

	<div class="flex gap-2">
		<Button
			variant={statusFilter === '' ? 'default' : 'outline'}
			size="sm"
			onclick={() => setStatusFilter('')}
		>{m.common_all()}</Button>
		<Button
			variant={statusFilter === 'ACTIVE' ? 'default' : 'outline'}
			size="sm"
			onclick={() => setStatusFilter('ACTIVE')}
		>{m.exploratory_status_active()}</Button>
		<Button
			variant={statusFilter === 'PAUSED' ? 'default' : 'outline'}
			size="sm"
			onclick={() => setStatusFilter('PAUSED')}
		>{m.exploratory_status_paused()}</Button>
		<Button
			variant={statusFilter === 'COMPLETED' ? 'default' : 'outline'}
			size="sm"
			onclick={() => setStatusFilter('COMPLETED')}
		>{m.exploratory_status_completed()}</Button>
	</div>

	{#if data.sessions.length === 0}
		<div class="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
			<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground mb-4">
				<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
			</svg>
			<h3 class="text-lg font-semibold">{m.exploratory_empty()}</h3>
			<p class="text-muted-foreground mt-1 text-sm">{m.exploratory_empty_hint()}</p>
			<Button class="mt-4" size="sm" onclick={() => (showNewDialog = true)}>{m.exploratory_new()}</Button>
		</div>
	{:else}
		<div class="border rounded-md overflow-hidden">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head class="py-1 px-2 text-xs">{m.common_title()}</Table.Head>
						<Table.Head class="py-1 px-2 text-xs hidden md:table-cell">{m.exploratory_charter()}</Table.Head>
						<Table.Head class="w-24 py-1 px-2 text-xs">{m.common_status()}</Table.Head>
						<Table.Head class="w-20 py-1 px-2 text-xs hidden sm:table-cell">{m.exploratory_duration()}</Table.Head>
						<Table.Head class="w-16 py-1 px-2 text-xs hidden sm:table-cell">{m.exploratory_notes()}</Table.Head>
						<Table.Head class="w-24 py-1 px-2 text-xs hidden lg:table-cell">{m.tr_created_by()}</Table.Head>
						<Table.Head class="w-28 py-1 px-2 text-xs hidden lg:table-cell">{m.common_date()}</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.sessions as session (session.id)}
						<Table.Row
							class="cursor-pointer hover:bg-muted/50"
							onclick={() => goto(`/projects/${projectId}/exploratory/${session.id}`)}
						>
							<Table.Cell class="py-1 px-2 text-xs font-medium">
								{session.title}
								<div class="text-muted-foreground md:hidden text-[10px] truncate max-w-[200px]">
									{session.charter ?? ''}
								</div>
							</Table.Cell>
							<Table.Cell class="text-muted-foreground py-1 px-2 text-xs max-w-[200px] truncate hidden md:table-cell">
								{session.charter ?? '-'}
							</Table.Cell>
							<Table.Cell class="py-1 px-2 text-xs">
								<Badge variant={statusVariant(session.status)} class="text-[10px] px-1.5 py-0">{statusLabel(session.status)}</Badge>
							</Table.Cell>
							<Table.Cell class="text-muted-foreground py-1 px-2 text-xs hidden sm:table-cell">{formatDuration(session)}</Table.Cell>
							<Table.Cell class="text-muted-foreground py-1 px-2 text-xs hidden sm:table-cell">{session.noteCount}</Table.Cell>
							<Table.Cell class="text-muted-foreground py-1 px-2 text-xs hidden lg:table-cell">{session.createdBy}</Table.Cell>
							<Table.Cell class="text-muted-foreground py-1 px-2 text-xs hidden lg:table-cell">
								{new Date(session.startedAt).toLocaleDateString()}
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</div>
		<p class="text-muted-foreground text-sm">{m.common_total_count({ count: data.total })}</p>
	{/if}
</div>

<Dialog.Root bind:open={showNewDialog}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>{m.exploratory_new()}</Dialog.Title>
			<Dialog.Description>{m.exploratory_new_desc()}</Dialog.Description>
		</Dialog.Header>
		<div class="space-y-3">
			<div>
				<Label>{m.common_title()}</Label>
				<Input bind:value={newTitle} placeholder={m.exploratory_title_placeholder()} />
			</div>
			<div>
				<Label>{m.exploratory_charter()}</Label>
				<Textarea bind:value={newCharter} placeholder={m.exploratory_charter_placeholder()} rows={3} />
			</div>
			<div>
				<Label>{m.common_environment()}</Label>
				<Input bind:value={newEnvironment} placeholder={m.exploratory_env_placeholder()} />
			</div>
			<div>
				<Label>{m.exploratory_tags_label()}</Label>
				<Input bind:value={newTags} placeholder={m.exploratory_tags_placeholder()} />
			</div>
		</div>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (showNewDialog = false)}>{m.common_cancel()}</Button>
			<Button onclick={createSession} disabled={creating || !newTitle.trim()}>
				{creating ? m.common_creating() : m.exploratory_start()}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
