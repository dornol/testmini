<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import * as Table from '$lib/components/ui/table/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import * as m from '$lib/paraglide/messages.js';
	import { apiPost, apiDelete } from '$lib/api-client';

	let { data } = $props();

	const basePath = $derived(`/projects/${data.project.id}/releases`);
	const canManage = $derived(
		data.userRole === 'PROJECT_ADMIN' || data.userRole === 'QA' || data.userRole === 'ADMIN'
	);
	const canDelete = $derived(
		data.userRole === 'PROJECT_ADMIN' || data.userRole === 'ADMIN'
	);

	let statusFilter = $state('');

	const statuses = ['PLANNING', 'IN_PROGRESS', 'READY', 'RELEASED'] as const;

	function statusLabel(s: string) {
		const map: Record<string, () => string> = {
			PLANNING: m.rel_status_planning,
			IN_PROGRESS: m.rel_status_in_progress,
			READY: m.rel_status_ready,
			RELEASED: m.rel_status_released
		};
		return map[s]?.() ?? s;
	}

	function statusVariant(s: string): 'default' | 'secondary' | 'outline' | 'destructive' {
		switch (s) {
			case 'PLANNING': return 'outline';
			case 'IN_PROGRESS': return 'secondary';
			case 'READY': return 'default';
			case 'RELEASED': return 'default';
			default: return 'outline';
		}
	}

	const filteredReleases = $derived(
		statusFilter
			? data.releases.filter((r) => r.status === statusFilter)
			: data.releases
	);

	// Create dialog
	let createDialogOpen = $state(false);
	let createName = $state('');
	let createVersion = $state('');
	let createDesc = $state('');
	let createSaving = $state(false);

	function openCreate() {
		createName = '';
		createVersion = '';
		createDesc = '';
		createDialogOpen = true;
	}

	async function handleCreate() {
		if (!createName.trim()) return;
		createSaving = true;
		try {
			const result = await apiPost<{ id: number }>(`/api/projects/${data.project.id}/releases`, {
				name: createName.trim(),
				version: createVersion.trim() || undefined,
				description: createDesc.trim() || undefined
			});
			createDialogOpen = false;
			toast.success(m.rel_created());
			goto(`${basePath}/${result.id}`);
		} catch {
			// handled
		} finally {
			createSaving = false;
		}
	}

	// Delete dialog
	let deleteDialogOpen = $state(false);
	let deleteId = $state<number | null>(null);
	let deleteSaving = $state(false);

	function openDelete(id: number) {
		deleteId = id;
		deleteDialogOpen = true;
	}

	async function handleDelete() {
		if (!deleteId) return;
		deleteSaving = true;
		try {
			await apiDelete(`/api/projects/${data.project.id}/releases/${deleteId}`);
			deleteDialogOpen = false;
			toast.success(m.rel_deleted());
			await invalidateAll();
		} catch {
			// handled
		} finally {
			deleteSaving = false;
		}
	}

	function formatDate(date: string | Date | null) {
		if (!date) return '-';
		return new Date(date).toLocaleDateString();
	}
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<h2 class="text-lg font-semibold">{m.rel_title()}</h2>
		{#if canManage}
			<Button size="sm" onclick={openCreate}>{m.rel_new()}</Button>
		{/if}
	</div>

	<!-- Status filter tabs -->
	<div class="flex gap-1 flex-wrap">
		<Button
			variant={statusFilter === '' ? 'default' : 'outline'}
			size="sm"
			onclick={() => (statusFilter = '')}
		>
			{m.common_all()}
		</Button>
		{#each statuses as s}
			<Button
				variant={statusFilter === s ? 'default' : 'outline'}
				size="sm"
				onclick={() => (statusFilter = s)}
			>
				{statusLabel(s)}
			</Button>
		{/each}
	</div>

	{#if filteredReleases.length === 0}
		<div class="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
			<h3 class="text-lg font-semibold">{m.rel_empty_title()}</h3>
			<p class="text-muted-foreground mt-1 text-sm">{m.rel_empty_create()}</p>
			{#if canManage}
				<Button class="mt-4" onclick={openCreate}>{m.rel_create()}</Button>
			{/if}
		</div>
	{:else}
		<div class="border rounded-md overflow-hidden">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head class="py-1 px-2 text-xs">{m.common_name()}</Table.Head>
						<Table.Head class="w-24 py-1 px-2 text-xs">{m.rel_version()}</Table.Head>
						<Table.Head class="w-28 py-1 px-2 text-xs">{m.common_status()}</Table.Head>
						<Table.Head class="w-24 py-1 px-2 text-xs">{m.rel_target_date()}</Table.Head>
						<Table.Head class="w-20 py-1 px-2 text-xs">{m.nav_test_plans()}</Table.Head>
						<Table.Head class="w-20 py-1 px-2 text-xs">{m.nav_test_runs()}</Table.Head>
						<Table.Head class="w-24 py-1 px-2 text-xs">{m.tr_created_by()}</Table.Head>
						{#if canDelete}
							<Table.Head class="w-16 py-1 px-2 text-xs">{m.common_actions()}</Table.Head>
						{/if}
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each filteredReleases as rel (rel.id)}
						<Table.Row
							class="cursor-pointer hover:bg-muted/50"
							onclick={() => goto(`${basePath}/${rel.id}`)}
						>
							<Table.Cell class="py-1 px-2 text-xs font-medium">{rel.name}</Table.Cell>
							<Table.Cell class="text-muted-foreground py-1 px-2 text-xs">{rel.version ?? '-'}</Table.Cell>
							<Table.Cell class="py-1 px-2 text-xs">
								<Badge variant={statusVariant(rel.status)}>{statusLabel(rel.status)}</Badge>
							</Table.Cell>
							<Table.Cell class="text-muted-foreground py-1 px-2 text-xs">{formatDate(rel.targetDate)}</Table.Cell>
							<Table.Cell class="py-1 px-2 text-xs">{rel.planCount}</Table.Cell>
							<Table.Cell class="py-1 px-2 text-xs">{rel.runCount}</Table.Cell>
							<Table.Cell class="text-muted-foreground py-1 px-2 text-xs">{rel.createdBy}</Table.Cell>
							{#if canDelete}
								<Table.Cell class="py-1 px-2">
									<DropdownMenu.Root>
										<DropdownMenu.Trigger>
											{#snippet child({ props })}
												<Button variant="ghost" size="sm" class="h-6 w-6 p-0" {...props} onclick={(e: MouseEvent) => e.stopPropagation()} aria-label={m.common_actions()}>
													<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>
												</Button>
											{/snippet}
										</DropdownMenu.Trigger>
										<DropdownMenu.Content align="end">
											<DropdownMenu.Item onclick={() => goto(`${basePath}/${rel.id}`)}>
												{m.common_edit()}
											</DropdownMenu.Item>
											<DropdownMenu.Separator />
											<DropdownMenu.Item class="text-destructive" onclick={() => { openDelete(rel.id); }}>
												{m.common_delete()}
											</DropdownMenu.Item>
										</DropdownMenu.Content>
									</DropdownMenu.Root>
								</Table.Cell>
							{/if}
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</div>
	{/if}
</div>

<!-- Create Release Dialog -->
<Dialog.Root bind:open={createDialogOpen}>
	<Dialog.Portal>
		<Dialog.Overlay />
		<Dialog.Content class="sm:max-w-md">
			<Dialog.Header>
				<Dialog.Title>{m.rel_create()}</Dialog.Title>
			</Dialog.Header>
			<div class="space-y-4 py-4">
				<div class="space-y-2">
					<Label for="relName">{m.rel_name()}</Label>
					<Input id="relName" bind:value={createName} placeholder={m.rel_name_placeholder()} />
				</div>
				<div class="space-y-2">
					<Label for="relVersion">{m.rel_version()}</Label>
					<Input id="relVersion" bind:value={createVersion} placeholder={m.rel_version_placeholder()} />
				</div>
				<div class="space-y-2">
					<Label for="relDesc">{m.common_description()}</Label>
					<Input id="relDesc" bind:value={createDesc} />
				</div>
			</div>
			<Dialog.Footer>
				<Button variant="outline" onclick={() => (createDialogOpen = false)}>{m.common_cancel()}</Button>
				<Button onclick={handleCreate} disabled={createSaving || !createName.trim()}>
					{createSaving ? m.common_creating() : m.rel_create()}
				</Button>
			</Dialog.Footer>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<!-- Delete Release Dialog -->
<AlertDialog.Root bind:open={deleteDialogOpen}>
	<AlertDialog.Portal>
		<AlertDialog.Overlay />
		<AlertDialog.Content>
			<AlertDialog.Header>
				<AlertDialog.Title>{m.rel_delete_title()}</AlertDialog.Title>
				<AlertDialog.Description>{m.rel_delete_confirm()}</AlertDialog.Description>
			</AlertDialog.Header>
			<AlertDialog.Footer>
				<AlertDialog.Cancel>{m.common_cancel()}</AlertDialog.Cancel>
				<Button variant="destructive" onclick={handleDelete} disabled={deleteSaving}>
					{deleteSaving ? m.common_saving() : m.common_delete()}
				</Button>
			</AlertDialog.Footer>
		</AlertDialog.Content>
	</AlertDialog.Portal>
</AlertDialog.Root>
