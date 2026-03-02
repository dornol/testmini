<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { toast } from 'svelte-sonner';
	import * as Table from '$lib/components/ui/table/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import * as m from '$lib/paraglide/messages.js';

	let { data } = $props();

	const basePath = $derived(`/projects/${data.project.id}/test-runs`);
	const canExecute = $derived(data.userRole !== 'VIEWER');
	const isAdmin = $derived(data.userRole === 'PROJECT_ADMIN' || data.userRole === 'ADMIN');

	// Edit dialog state
	let editDialogOpen = $state(false);
	let editRunId = $state<number | null>(null);
	let editRunName = $state('');
	let editRunEnv = $state('');
	let editRunSaving = $state(false);

	// Clone dialog state
	let cloneDialogOpen = $state(false);
	let cloneRunId = $state<number | null>(null);
	let cloneRunName = $state('');
	let cloneRunSaving = $state(false);

	// Delete dialog state
	let deleteDialogOpen = $state(false);
	let deleteRunId = $state<number | null>(null);
	let deleteRunSaving = $state(false);

	// Compare state
	let compareSelectedIds = $state(new Set<number>());

	function toggleCompareRun(id: number) {
		const next = new Set(compareSelectedIds);
		if (next.has(id)) {
			next.delete(id);
		} else if (next.size < 2) {
			next.add(id);
		} else {
			// Replace oldest selection
			const arr = Array.from(next);
			next.delete(arr[0]);
			next.add(id);
		}
		compareSelectedIds = next;
	}

	function goToCompare() {
		const ids = Array.from(compareSelectedIds);
		if (ids.length === 2) {
			goto(`${basePath}/compare?runA=${ids[0]}&runB=${ids[1]}`);
		}
	}

	const environments = ['DEV', 'QA', 'STAGE', 'PROD'];

	function openEdit(run: typeof data.runs[0]) {
		editRunId = run.id;
		editRunName = run.name;
		editRunEnv = run.environment;
		editDialogOpen = true;
	}

	function openClone(run: typeof data.runs[0]) {
		cloneRunId = run.id;
		cloneRunName = `Copy of ${run.name}`;
		cloneDialogOpen = true;
	}

	function openDelete(run: typeof data.runs[0]) {
		deleteRunId = run.id;
		deleteDialogOpen = true;
	}

	async function handleEdit() {
		if (!editRunId) return;
		editRunSaving = true;
		try {
			const res = await fetch(`/api/projects/${data.project.id}/test-runs/${editRunId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: editRunName, environment: editRunEnv })
			});
			if (!res.ok) {
				const err = await res.json();
				toast.error(err.error ?? 'Failed to update');
				return;
			}
			editDialogOpen = false;
			toast.success(m.tr_updated());
			await invalidateAll();
		} finally {
			editRunSaving = false;
		}
	}

	async function handleClone() {
		if (!cloneRunId) return;
		cloneRunSaving = true;
		try {
			const res = await fetch(`/api/projects/${data.project.id}/test-runs/${cloneRunId}/clone`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: cloneRunName })
			});
			if (!res.ok) {
				toast.error(m.error_clone_failed());
				return;
			}
			const { id } = await res.json();
			cloneDialogOpen = false;
			toast.success(m.tr_cloned());
			goto(`${basePath}/${id}`);
		} finally {
			cloneRunSaving = false;
		}
	}

	async function handleDelete() {
		if (!deleteRunId) return;
		deleteRunSaving = true;
		try {
			const res = await fetch(`/api/projects/${data.project.id}/test-runs/${deleteRunId}`, {
				method: 'DELETE'
			});
			if (!res.ok) {
				toast.error(m.error_delete_failed());
				return;
			}
			deleteDialogOpen = false;
			toast.success(m.tr_deleted());
			await invalidateAll();
		} finally {
			deleteRunSaving = false;
		}
	}

	function setStatus(s: string) {
		const params = new URLSearchParams(page.url.searchParams);
		if (s) {
			params.set('status', s);
		} else {
			params.delete('status');
		}
		params.set('page', '1');
		goto(`${basePath}?${params.toString()}`);
	}

	function goToPage(p: number) {
		const params = new URLSearchParams(page.url.searchParams);
		params.set('page', String(p));
		goto(`${basePath}?${params.toString()}`);
	}

	function statusVariant(s: string): 'default' | 'secondary' | 'outline' | 'destructive' {
		switch (s) {
			case 'COMPLETED':
				return 'default';
			case 'IN_PROGRESS':
				return 'secondary';
			default:
				return 'outline';
		}
	}

	function progressPercent(passed: number, total: number): number {
		if (total === 0) return 0;
		return Math.round((passed / total) * 100);
	}

	const statuses = ['', 'CREATED', 'IN_PROGRESS', 'COMPLETED'];
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<h2 class="text-lg font-semibold">{m.tr_title()}</h2>
		<div class="flex items-center gap-2">
			{#if compareSelectedIds.size === 2}
				<Button variant="outline" size="sm" onclick={goToCompare}>{m.tr_compare()}</Button>
			{:else if compareSelectedIds.size > 0}
				<span class="text-muted-foreground text-xs">{m.tr_compare_select_hint()}</span>
			{/if}
			{#if data.userRole !== 'VIEWER'}
				<Button href="{basePath}/new" size="sm">{m.tr_new()}</Button>
			{/if}
		</div>
	</div>

	<div class="flex gap-1">
		{#each statuses as s (s)}
			<Button
				variant={data.statusFilter === s ? 'default' : 'outline'}
				size="sm"
				class="h-7 px-2 text-xs"
				onclick={() => setStatus(s)}
			>
				{s || m.common_all()}
			</Button>
		{/each}
	</div>

	{#if data.runs.length === 0}
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
				<path d="M5 22h14" />
				<path d="M5 2h14" />
				<path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22" />
				<path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2" />
			</svg>
			<h3 class="text-lg font-semibold">{m.tr_empty_title()}</h3>
			<p class="text-muted-foreground mt-1 text-sm">
				{#if data.statusFilter}
					{m.tr_empty_filter()}
				{:else}
					{m.tr_empty_create()}
				{/if}
			</p>
			{#if !data.statusFilter && data.userRole !== 'VIEWER'}
				<Button href="{basePath}/new" class="mt-4">{m.tr_create()}</Button>
			{/if}
		</div>
	{:else}
		<div class="border rounded-md overflow-hidden">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head class="w-8 py-1 px-2"></Table.Head>
						<Table.Head class="py-1 px-2 text-xs">{m.common_name()}</Table.Head>
						<Table.Head class="w-20 py-1 px-2 text-xs">{m.common_environment()}</Table.Head>
						<Table.Head class="w-24 py-1 px-2 text-xs">{m.common_status()}</Table.Head>
						<Table.Head class="w-36 py-1 px-2 text-xs">{m.tr_progress()}</Table.Head>
						<Table.Head class="w-24 py-1 px-2 text-xs">{m.tr_created_by()}</Table.Head>
						<Table.Head class="w-28 py-1 px-2 text-xs">{m.tr_created_at()}</Table.Head>
						{#if canExecute}
							<Table.Head class="w-16 py-1 px-2 text-xs">{m.common_actions()}</Table.Head>
						{/if}
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.runs as run (run.id)}
						{@const pct = progressPercent(run.passedCount, run.totalCount)}
						<Table.Row class="cursor-pointer hover:bg-muted/50" onclick={() => goto(`${basePath}/${run.id}`)}>
							<Table.Cell class="py-1 px-2" onclick={(e: MouseEvent) => e.stopPropagation()}>
								<input
									type="checkbox"
									checked={compareSelectedIds.has(run.id)}
									onchange={() => toggleCompareRun(run.id)}
									class="h-3.5 w-3.5 rounded border-gray-300"
								/>
							</Table.Cell>
							<Table.Cell class="py-1 px-2 text-xs font-medium">{run.name}</Table.Cell>
							<Table.Cell class="py-1 px-2">
								<Badge variant="outline" class="text-[10px] px-1.5 py-0">{run.environment}</Badge>
							</Table.Cell>
							<Table.Cell class="py-1 px-2">
								<Badge variant={statusVariant(run.status)} class="text-[10px] px-1.5 py-0">
									{run.status.replace('_', ' ')}
								</Badge>
							</Table.Cell>
							<Table.Cell class="py-1 px-2">
								<div class="flex items-center gap-1">
									<div class="bg-secondary h-1.5 w-full rounded-full">
										<div
											class="bg-primary h-1.5 rounded-full transition-all"
											style="width: {pct}%"
										></div>
									</div>
									<span class="text-muted-foreground w-10 text-right text-[10px]">
										{run.passedCount}/{run.totalCount}
									</span>
								</div>
							</Table.Cell>
							<Table.Cell class="text-muted-foreground py-1 px-2 text-xs">{run.createdBy}</Table.Cell>
							<Table.Cell class="text-muted-foreground py-1 px-2 text-xs">
								{new Date(run.createdAt).toLocaleDateString()}
							</Table.Cell>
							{#if canExecute}
								<Table.Cell class="py-1 px-2">
									<DropdownMenu.Root>
										<DropdownMenu.Trigger>
											{#snippet child({ props })}
												<Button variant="ghost" size="sm" class="h-6 w-6 p-0" {...props} onclick={(e: MouseEvent) => e.stopPropagation()}>
													<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>
												</Button>
											{/snippet}
										</DropdownMenu.Trigger>
										<DropdownMenu.Content align="end">
											{#if run.status === 'CREATED'}
												<DropdownMenu.Item onclick={() => { openEdit(run); }}>
													{m.tr_edit()}
												</DropdownMenu.Item>
											{/if}
											<DropdownMenu.Item onclick={() => { openClone(run); }}>
												{m.tr_clone()}
											</DropdownMenu.Item>
											{#if isAdmin}
												<DropdownMenu.Separator />
												<DropdownMenu.Item class="text-destructive" onclick={() => { openDelete(run); }}>
													{m.tr_delete()}
												</DropdownMenu.Item>
											{/if}
										</DropdownMenu.Content>
									</DropdownMenu.Root>
								</Table.Cell>
							{/if}
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</div>

		{#if data.meta.totalPages > 1}
			<div class="flex items-center justify-center gap-2">
				<Button
					variant="outline"
					size="sm"
					class="h-7 px-2 text-xs"
					disabled={data.meta.page <= 1}
					onclick={() => goToPage(data.meta.page - 1)}
				>
					{m.common_previous()}
				</Button>
				<span class="text-muted-foreground text-xs">
					Page {data.meta.page} of {data.meta.totalPages}
				</span>
				<Button
					variant="outline"
					size="sm"
					class="h-7 px-2 text-xs"
					disabled={data.meta.page >= data.meta.totalPages}
					onclick={() => goToPage(data.meta.page + 1)}
				>
					{m.common_next()}
				</Button>
			</div>
		{/if}
	{/if}
</div>

<!-- Edit Run Dialog -->
<Dialog.Root bind:open={editDialogOpen}>
	<Dialog.Portal>
		<Dialog.Overlay />
		<Dialog.Content class="sm:max-w-md">
			<Dialog.Header>
				<Dialog.Title>{m.tr_edit_title()}</Dialog.Title>
			</Dialog.Header>
			<div class="space-y-4 py-4">
				<div class="space-y-2">
					<Label for="editName">{m.tr_run_name()}</Label>
					<Input id="editName" bind:value={editRunName} />
				</div>
				<div class="space-y-2">
					<Label for="editEnv">{m.common_environment()}</Label>
					<Select.Root
						type="single"
						value={editRunEnv}
						onValueChange={(v: string) => { editRunEnv = v; }}
					>
						<Select.Trigger class="w-full">
							{editRunEnv}
						</Select.Trigger>
						<Select.Content>
							{#each environments as env}
								<Select.Item value={env} label={env} />
							{/each}
						</Select.Content>
					</Select.Root>
				</div>
			</div>
			<Dialog.Footer>
				<Button variant="outline" onclick={() => (editDialogOpen = false)}>
					{m.common_cancel()}
				</Button>
				<Button onclick={handleEdit} disabled={editRunSaving || !editRunName.trim()}>
					{editRunSaving ? m.common_saving() : m.common_save_changes()}
				</Button>
			</Dialog.Footer>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<!-- Clone Run Dialog -->
<Dialog.Root bind:open={cloneDialogOpen}>
	<Dialog.Portal>
		<Dialog.Overlay />
		<Dialog.Content class="sm:max-w-md">
			<Dialog.Header>
				<Dialog.Title>{m.tr_clone_title()}</Dialog.Title>
			</Dialog.Header>
			<div class="space-y-4 py-4">
				<div class="space-y-2">
					<Label for="cloneName">{m.tr_clone_name_label()}</Label>
					<Input id="cloneName" bind:value={cloneRunName} />
				</div>
			</div>
			<Dialog.Footer>
				<Button variant="outline" onclick={() => (cloneDialogOpen = false)}>
					{m.common_cancel()}
				</Button>
				<Button onclick={handleClone} disabled={cloneRunSaving || !cloneRunName.trim()}>
					{cloneRunSaving ? m.common_creating() : m.tr_clone()}
				</Button>
			</Dialog.Footer>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<!-- Delete Run Dialog -->
<AlertDialog.Root bind:open={deleteDialogOpen}>
	<AlertDialog.Portal>
		<AlertDialog.Overlay />
		<AlertDialog.Content>
			<AlertDialog.Header>
				<AlertDialog.Title>{m.tr_delete_title()}</AlertDialog.Title>
				<AlertDialog.Description>
					{m.tr_delete_confirm()}
				</AlertDialog.Description>
			</AlertDialog.Header>
			<AlertDialog.Footer>
				<AlertDialog.Cancel>{m.common_cancel()}</AlertDialog.Cancel>
				<Button variant="destructive" onclick={handleDelete} disabled={deleteRunSaving}>
					{deleteRunSaving ? m.common_saving() : m.common_delete()}
				</Button>
			</AlertDialog.Footer>
		</AlertDialog.Content>
	</AlertDialog.Portal>
</AlertDialog.Root>
