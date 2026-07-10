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

	function formatDuration(session: {
		startedAt: string | Date;
		pausedDuration: number;
		completedAt: string | Date | null;
		status: string;
	}): string {
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
				tags: newTags.trim()
					? newTags
							.split(',')
							.map((t) => t.trim())
							.filter(Boolean)
					: []
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
	<div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
		<h2 class="text-lg font-semibold">{m.exploratory_title()}</h2>
		<Button size="sm" class="w-full sm:w-auto" onclick={() => (showNewDialog = true)}>
			{m.exploratory_new()}
		</Button>
	</div>

	<div class="grid grid-cols-2 gap-2 min-[420px]:flex min-[420px]:flex-wrap">
		<Button
			variant={statusFilter === '' ? 'default' : 'outline'}
			size="sm"
			class="w-full min-[420px]:w-auto"
			onclick={() => setStatusFilter('')}>{m.common_all()}</Button
		>
		<Button
			variant={statusFilter === 'ACTIVE' ? 'default' : 'outline'}
			size="sm"
			class="w-full min-[420px]:w-auto"
			onclick={() => setStatusFilter('ACTIVE')}>{m.exploratory_status_active()}</Button
		>
		<Button
			variant={statusFilter === 'PAUSED' ? 'default' : 'outline'}
			size="sm"
			class="w-full min-[420px]:w-auto"
			onclick={() => setStatusFilter('PAUSED')}>{m.exploratory_status_paused()}</Button
		>
		<Button
			variant={statusFilter === 'COMPLETED' ? 'default' : 'outline'}
			size="sm"
			class="w-full min-[420px]:w-auto"
			onclick={() => setStatusFilter('COMPLETED')}>{m.exploratory_status_completed()}</Button
		>
	</div>

	{#if data.sessions.length === 0}
		<div
			class="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="48"
				height="48"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="1.5"
				stroke-linecap="round"
				stroke-linejoin="round"
				class="text-muted-foreground mb-4"
			>
				<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path
					d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"
				/>
			</svg>
			<h3 class="text-lg font-semibold">{m.exploratory_empty()}</h3>
			<p class="text-muted-foreground mt-1 text-sm">{m.exploratory_empty_hint()}</p>
			<Button class="mt-4 w-full sm:w-auto" size="sm" onclick={() => (showNewDialog = true)}
				>{m.exploratory_new()}</Button
			>
		</div>
	{:else}
		<div class="grid gap-3 md:hidden">
			{#each data.sessions as session (session.id)}
				<button
					type="button"
					class="w-full rounded-md border p-3 text-left transition-colors hover:bg-muted/50"
					onclick={() => goto(`/projects/${projectId}/exploratory/${session.id}`)}
				>
					<div
						class="flex flex-col gap-2 min-[420px]:flex-row min-[420px]:items-start min-[420px]:justify-between"
					>
						<div class="min-w-0">
							<div class="break-words text-sm font-medium">{session.title}</div>
							{#if session.charter}
								<p class="mt-1 line-clamp-2 text-xs text-muted-foreground">{session.charter}</p>
							{/if}
						</div>
						<Badge variant={statusVariant(session.status)} class="w-fit text-[10px] px-1.5 py-0">
							{statusLabel(session.status)}
						</Badge>
					</div>
					<dl class="mt-3 grid grid-cols-1 gap-2 text-xs min-[360px]:grid-cols-3">
						<div>
							<dt class="text-muted-foreground">{m.exploratory_duration()}</dt>
							<dd class="font-medium">{formatDuration(session)}</dd>
						</div>
						<div>
							<dt class="text-muted-foreground">{m.exploratory_notes()}</dt>
							<dd class="font-medium">{session.noteCount}</dd>
						</div>
						<div>
							<dt class="text-muted-foreground">{m.common_date()}</dt>
							<dd class="font-medium">{new Date(session.startedAt).toLocaleDateString()}</dd>
						</div>
					</dl>
				</button>
			{/each}
		</div>
		<div class="hidden overflow-x-auto rounded-md border md:block">
			<Table.Root class="min-w-[720px] table-fixed">
				<Table.Header>
					<Table.Row>
						<Table.Head class="py-1 px-2 text-xs">{m.common_title()}</Table.Head>
						<Table.Head class="py-1 px-2 text-xs hidden md:table-cell"
							>{m.exploratory_charter()}</Table.Head
						>
						<Table.Head class="w-24 py-1 px-2 text-xs">{m.common_status()}</Table.Head>
						<Table.Head class="w-20 py-1 px-2 text-xs hidden sm:table-cell"
							>{m.exploratory_duration()}</Table.Head
						>
						<Table.Head class="w-16 py-1 px-2 text-xs hidden sm:table-cell"
							>{m.exploratory_notes()}</Table.Head
						>
						<Table.Head class="w-24 py-1 px-2 text-xs hidden lg:table-cell"
							>{m.tr_created_by()}</Table.Head
						>
						<Table.Head class="w-28 py-1 px-2 text-xs hidden lg:table-cell"
							>{m.common_date()}</Table.Head
						>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.sessions as session (session.id)}
						<Table.Row
							class="cursor-pointer hover:bg-muted/50"
							onclick={() => goto(`/projects/${projectId}/exploratory/${session.id}`)}
						>
							<Table.Cell class="min-w-0 py-1 px-2 text-xs font-medium">
								<div class="truncate" title={session.title}>{session.title}</div>
								<div class="text-muted-foreground md:hidden text-[10px] truncate max-w-[200px]">
									{session.charter ?? ''}
								</div>
							</Table.Cell>
							<Table.Cell
								class="text-muted-foreground py-1 px-2 text-xs max-w-[200px] truncate hidden md:table-cell"
							>
								{session.charter ?? '-'}
							</Table.Cell>
							<Table.Cell class="py-1 px-2 text-xs">
								<Badge variant={statusVariant(session.status)} class="text-[10px] px-1.5 py-0"
									>{statusLabel(session.status)}</Badge
								>
							</Table.Cell>
							<Table.Cell class="text-muted-foreground py-1 px-2 text-xs hidden sm:table-cell"
								>{formatDuration(session)}</Table.Cell
							>
							<Table.Cell class="text-muted-foreground py-1 px-2 text-xs hidden sm:table-cell"
								>{session.noteCount}</Table.Cell
							>
							<Table.Cell class="text-muted-foreground py-1 px-2 text-xs hidden lg:table-cell">
								<div class="truncate" title={session.createdBy}>{session.createdBy}</div>
							</Table.Cell>
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
				<Textarea
					bind:value={newCharter}
					placeholder={m.exploratory_charter_placeholder()}
					rows={3}
				/>
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
			<Button class="w-full sm:w-auto" variant="outline" onclick={() => (showNewDialog = false)}>
				{m.common_cancel()}
			</Button>
			<Button
				class="w-full sm:w-auto"
				onclick={createSession}
				disabled={creating || !newTitle.trim()}
			>
				{creating ? m.common_creating() : m.exploratory_start()}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
