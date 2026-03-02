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
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import * as m from '$lib/paraglide/messages.js';

	let { data } = $props();

	const basePath = $derived(`/projects/${data.project.id}/test-suites`);
	const canManage = $derived(
		data.userRole === 'PROJECT_ADMIN' || data.userRole === 'QA' || data.userRole === 'ADMIN'
	);

	// Create dialog
	let createDialogOpen = $state(false);
	let newName = $state('');
	let newDesc = $state('');
	let creating = $state(false);

	// Edit dialog
	let editDialogOpen = $state(false);
	let editId = $state<number | null>(null);
	let editName = $state('');
	let editDesc = $state('');
	let editSaving = $state(false);

	// Delete dialog
	let deleteDialogOpen = $state(false);
	let deleteId = $state<number | null>(null);
	let deleteSaving = $state(false);

	async function handleCreate() {
		creating = true;
		try {
			const res = await fetch(`/api/projects/${data.project.id}/test-suites`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: newName, description: newDesc || undefined })
			});
			if (!res.ok) {
				const err = await res.json();
				toast.error(err.error ?? 'Failed to create');
				return;
			}
			createDialogOpen = false;
			newName = '';
			newDesc = '';
			toast.success(m.suite_created());
			await invalidateAll();
		} finally {
			creating = false;
		}
	}

	function openEdit(suite: typeof data.suites[0]) {
		editId = suite.id;
		editName = suite.name;
		editDesc = suite.description ?? '';
		editDialogOpen = true;
	}

	async function handleEdit() {
		if (!editId) return;
		editSaving = true;
		try {
			const res = await fetch(`/api/projects/${data.project.id}/test-suites/${editId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: editName, description: editDesc || null })
			});
			if (!res.ok) {
				const err = await res.json();
				toast.error(err.error ?? 'Failed to update');
				return;
			}
			editDialogOpen = false;
			toast.success(m.suite_updated());
			await invalidateAll();
		} finally {
			editSaving = false;
		}
	}

	function openDelete(id: number) {
		deleteId = id;
		deleteDialogOpen = true;
	}

	async function handleDelete() {
		if (!deleteId) return;
		deleteSaving = true;
		try {
			const res = await fetch(`/api/projects/${data.project.id}/test-suites/${deleteId}`, {
				method: 'DELETE'
			});
			if (!res.ok) {
				toast.error('Failed to delete');
				return;
			}
			deleteDialogOpen = false;
			toast.success(m.suite_deleted());
			await invalidateAll();
		} finally {
			deleteSaving = false;
		}
	}
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<h2 class="text-lg font-semibold">{m.suite_title()}</h2>
		{#if canManage}
			<Button size="sm" onclick={() => (createDialogOpen = true)}>{m.suite_new()}</Button>
		{/if}
	</div>

	{#if data.suites.length === 0}
		<div class="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
			<h3 class="text-lg font-semibold">{m.suite_empty()}</h3>
			<p class="text-muted-foreground mt-1 text-sm">{m.suite_empty_desc()}</p>
			{#if canManage}
				<Button class="mt-4" onclick={() => (createDialogOpen = true)}>{m.suite_create()}</Button>
			{/if}
		</div>
	{:else}
		<div class="border rounded-md overflow-hidden">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head class="py-1 px-2 text-xs">{m.common_name()}</Table.Head>
						<Table.Head class="py-1 px-2 text-xs">{m.common_description()}</Table.Head>
						<Table.Head class="w-28 py-1 px-2 text-xs">{m.nav_test_cases()}</Table.Head>
						<Table.Head class="w-24 py-1 px-2 text-xs">{m.tr_created_by()}</Table.Head>
						{#if canManage}
							<Table.Head class="w-16 py-1 px-2 text-xs">{m.common_actions()}</Table.Head>
						{/if}
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.suites as suite (suite.id)}
						<Table.Row
							class="cursor-pointer hover:bg-muted/50"
							onclick={() => goto(`${basePath}/${suite.id}`)}
						>
							<Table.Cell class="py-1 px-2 text-xs font-medium">{suite.name}</Table.Cell>
							<Table.Cell class="text-muted-foreground py-1 px-2 text-xs">
								{suite.description ?? '-'}
							</Table.Cell>
							<Table.Cell class="py-1 px-2 text-xs">{suite.itemCount}</Table.Cell>
							<Table.Cell class="text-muted-foreground py-1 px-2 text-xs">{suite.createdBy}</Table.Cell>
							{#if canManage}
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
											<DropdownMenu.Item onclick={() => { openEdit(suite); }}>
												{m.common_edit()}
											</DropdownMenu.Item>
											<DropdownMenu.Separator />
											<DropdownMenu.Item class="text-destructive" onclick={() => { openDelete(suite.id); }}>
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

<!-- Create Suite Dialog -->
<Dialog.Root bind:open={createDialogOpen}>
	<Dialog.Portal>
		<Dialog.Overlay />
		<Dialog.Content class="sm:max-w-md">
			<Dialog.Header>
				<Dialog.Title>{m.suite_new()}</Dialog.Title>
			</Dialog.Header>
			<div class="space-y-4 py-4">
				<div class="space-y-2">
					<Label for="suiteName">{m.suite_name_label()}</Label>
					<Input id="suiteName" bind:value={newName} placeholder={m.suite_name_placeholder()} />
				</div>
				<div class="space-y-2">
					<Label for="suiteDesc">{m.suite_desc_label()}</Label>
					<Textarea id="suiteDesc" bind:value={newDesc} placeholder={m.suite_desc_placeholder()} rows={3} />
				</div>
			</div>
			<Dialog.Footer>
				<Button variant="outline" onclick={() => (createDialogOpen = false)}>{m.common_cancel()}</Button>
				<Button onclick={handleCreate} disabled={creating || !newName.trim()}>
					{creating ? m.common_creating() : m.suite_create()}
				</Button>
			</Dialog.Footer>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<!-- Edit Suite Dialog -->
<Dialog.Root bind:open={editDialogOpen}>
	<Dialog.Portal>
		<Dialog.Overlay />
		<Dialog.Content class="sm:max-w-md">
			<Dialog.Header>
				<Dialog.Title>{m.common_edit()}</Dialog.Title>
			</Dialog.Header>
			<div class="space-y-4 py-4">
				<div class="space-y-2">
					<Label for="editSuiteName">{m.suite_name_label()}</Label>
					<Input id="editSuiteName" bind:value={editName} />
				</div>
				<div class="space-y-2">
					<Label for="editSuiteDesc">{m.suite_desc_label()}</Label>
					<Textarea id="editSuiteDesc" bind:value={editDesc} rows={3} />
				</div>
			</div>
			<Dialog.Footer>
				<Button variant="outline" onclick={() => (editDialogOpen = false)}>{m.common_cancel()}</Button>
				<Button onclick={handleEdit} disabled={editSaving || !editName.trim()}>
					{editSaving ? m.common_saving() : m.common_save_changes()}
				</Button>
			</Dialog.Footer>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<!-- Delete Suite Dialog -->
<AlertDialog.Root bind:open={deleteDialogOpen}>
	<AlertDialog.Portal>
		<AlertDialog.Overlay />
		<AlertDialog.Content>
			<AlertDialog.Header>
				<AlertDialog.Title>{m.suite_delete_title()}</AlertDialog.Title>
				<AlertDialog.Description>{m.suite_delete_confirm()}</AlertDialog.Description>
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
