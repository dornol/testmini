<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import PriorityBadge from '$lib/components/PriorityBadge.svelte';
	import VirtualList from '$lib/components/VirtualList.svelte';
	import * as m from '$lib/paraglide/messages.js';
	import { apiPatch, apiDelete, apiPost, apiFetch } from '$lib/api-client';

	type ProjectPriority = { name: string; color: string };

	let { data } = $props();

	const basePath = $derived(`/projects/${data.project.id}/test-suites`);
	const canManage = $derived(
		data.userRole === 'PROJECT_ADMIN' || data.userRole === 'QA' || data.userRole === 'ADMIN'
	);

	// Edit suite
	let editDialogOpen = $state(false);
	let editName = $state('');
	let editDesc = $state('');
	let editSaving = $state(false);

	// Delete suite
	let deleteDialogOpen = $state(false);
	let deleteSaving = $state(false);

	// Add cases dialog
	let addCasesDialogOpen = $state(false);
	let addCasesSearch = $state('');
	let addCasesSelected = $state<Set<number>>(new Set());
	let addCasesSaving = $state(false);

	const suiteItemTcIds = $derived(new Set(data.items.map((i) => i.testCaseId)));

	const availableCases = $derived(
		data.allTestCases.filter((tc) => {
			if (suiteItemTcIds.has(tc.id)) return false;
			if (!addCasesSearch) return true;
			const q = addCasesSearch.toLowerCase();
			return tc.title.toLowerCase().includes(q) || tc.key.toLowerCase().includes(q);
		})
	);

	function openEdit() {
		editName = data.suite.name;
		editDesc = data.suite.description ?? '';
		editDialogOpen = true;
	}

	async function handleEdit() {
		editSaving = true;
		try {
			await apiPatch(`/api/projects/${data.project.id}/test-suites/${data.suite.id}`, {
				name: editName,
				description: editDesc || null
			});
			editDialogOpen = false;
			toast.success(m.suite_updated());
			await invalidateAll();
		} catch {
			// error toast handled by apiPatch
		} finally {
			editSaving = false;
		}
	}

	async function handleDelete() {
		deleteSaving = true;
		try {
			await apiDelete(`/api/projects/${data.project.id}/test-suites/${data.suite.id}`);
			toast.success(m.suite_deleted());
			goto(basePath);
		} catch {
			// error toast handled by apiDelete
		} finally {
			deleteSaving = false;
		}
	}

	function openAddCases() {
		addCasesSearch = '';
		addCasesSelected = new Set();
		addCasesDialogOpen = true;
	}

	function toggleAddCase(id: number) {
		const newSet = new Set(addCasesSelected);
		if (newSet.has(id)) {
			newSet.delete(id);
		} else {
			newSet.add(id);
		}
		addCasesSelected = newSet;
	}

	async function handleAddCases() {
		if (addCasesSelected.size === 0) return;
		addCasesSaving = true;
		try {
			await apiPost(`/api/projects/${data.project.id}/test-suites/${data.suite.id}/items`, {
				testCaseIds: [...addCasesSelected]
			});
			addCasesDialogOpen = false;
			toast.success(m.suite_updated());
			await invalidateAll();
		} catch {
			// error toast handled by apiPost
		} finally {
			addCasesSaving = false;
		}
	}

	async function removeCase(testCaseId: number) {
		try {
			await apiFetch(`/api/projects/${data.project.id}/test-suites/${data.suite.id}/items`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ testCaseIds: [testCaseId] })
			});
			toast.success(m.suite_updated());
			await invalidateAll();
		} catch {
			// error toast handled by apiFetch
		}
	}

	function getPriorityColor(name: string): string {
		return (
			(data.projectPriorities as ProjectPriority[]).find((p) => p.name === name)?.color ?? '#6b7280'
		);
	}
</script>

<div class="space-y-4">
	<!-- Header -->
	<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
		<div class="min-w-0">
			<a href={basePath} class="text-muted-foreground hover:text-foreground text-sm">
				&larr; {m.common_back_to({ target: m.suite_title() })}
			</a>
			<div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
				<h2 class="min-w-0 break-words text-xl font-bold">{data.suite.name}</h2>
				<span class="shrink-0 text-sm text-muted-foreground"
					>{m.suite_tc_count({ count: data.items.length })}</span
				>
			</div>
			{#if data.suite.description}
				<p class="text-muted-foreground mt-1 break-words text-sm">{data.suite.description}</p>
			{/if}
		</div>
		<div
			class="grid w-full grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:flex sm:w-auto sm:flex-wrap sm:justify-end"
		>
			{#if canManage}
				<Button class="w-full sm:w-auto" variant="outline" size="sm" onclick={openAddCases}>
					{m.suite_add_cases()}
				</Button>
				<Button class="w-full sm:w-auto" variant="outline" size="sm" onclick={openEdit}>
					{m.common_edit()}
				</Button>
				<Button
					variant="outline"
					size="sm"
					class="w-full text-destructive hover:text-destructive sm:w-auto"
					onclick={() => (deleteDialogOpen = true)}
				>
					{m.common_delete()}
				</Button>
			{/if}
			<Button
				size="sm"
				class="w-full sm:w-auto"
				href={`/projects/${data.project.id}/test-runs/new?suiteId=${data.suite.id}`}
			>
				{m.suite_create_run()}
			</Button>
		</div>
	</div>

	<!-- Items Table -->
	{#if data.items.length === 0}
		<div
			class="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center"
		>
			<h3 class="text-lg font-semibold">{m.suite_no_cases()}</h3>
			{#if canManage}
				<Button class="mt-4 w-full sm:w-auto" onclick={openAddCases}>{m.suite_add_cases()}</Button>
			{/if}
		</div>
	{:else}
		<div class="grid gap-3 md:hidden">
			{#each data.items as item (item.id)}
				<div class="rounded-md border p-3">
					<div class="flex items-start justify-between gap-3">
						<div class="min-w-0">
							<div class="font-mono text-xs text-muted-foreground">{item.key}</div>
							<div class="mt-1 break-words font-medium">{item.title}</div>
						</div>
						<PriorityBadge name={item.priority} color={getPriorityColor(item.priority)} />
					</div>
					{#if canManage}
						<Button
							variant="ghost"
							size="sm"
							class="mt-2 h-8 w-full px-2 text-xs text-destructive hover:text-destructive sm:w-auto"
							onclick={() => removeCase(item.testCaseId)}
						>
							{m.suite_remove_case()}
						</Button>
					{/if}
				</div>
			{/each}
		</div>
		<Card.Root class="hidden md:block">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head class="w-28">{m.common_key()}</Table.Head>
						<Table.Head>{m.common_title()}</Table.Head>
						<Table.Head class="w-28">{m.common_priority()}</Table.Head>
						{#if canManage}
							<Table.Head class="w-24">{m.common_actions()}</Table.Head>
						{/if}
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.items as item (item.id)}
						<Table.Row>
							<Table.Cell class="font-mono text-sm">{item.key}</Table.Cell>
							<Table.Cell class="font-medium">{item.title}</Table.Cell>
							<Table.Cell>
								<PriorityBadge name={item.priority} color={getPriorityColor(item.priority)} />
							</Table.Cell>
							{#if canManage}
								<Table.Cell>
									<Button
										variant="ghost"
										size="sm"
										class="text-destructive hover:text-destructive h-7 px-2 text-xs"
										onclick={() => removeCase(item.testCaseId)}
									>
										{m.suite_remove_case()}
									</Button>
								</Table.Cell>
							{/if}
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</Card.Root>
	{/if}
</div>

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
				<Button variant="outline" class="w-full sm:w-auto" onclick={() => (editDialogOpen = false)}
					>{m.common_cancel()}</Button
				>
				<Button
					class="w-full sm:w-auto"
					onclick={handleEdit}
					disabled={editSaving || !editName.trim()}
				>
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
				<AlertDialog.Cancel class="w-full sm:w-auto">{m.common_cancel()}</AlertDialog.Cancel>
				<Button
					variant="destructive"
					class="w-full sm:w-auto"
					onclick={handleDelete}
					disabled={deleteSaving}
				>
					{deleteSaving ? m.common_saving() : m.common_delete()}
				</Button>
			</AlertDialog.Footer>
		</AlertDialog.Content>
	</AlertDialog.Portal>
</AlertDialog.Root>

<!-- Add Cases Dialog -->
<Dialog.Root bind:open={addCasesDialogOpen}>
	<Dialog.Portal>
		<Dialog.Overlay />
		<Dialog.Content class="flex max-h-[85dvh] flex-col sm:max-w-2xl">
			<Dialog.Header>
				<Dialog.Title>{m.suite_add_cases()}</Dialog.Title>
			</Dialog.Header>
			<div class="flex flex-1 flex-col space-y-3 overflow-hidden py-4">
				<Input placeholder={m.tr_filter_placeholder()} bind:value={addCasesSearch} />
				<div class="flex-1 rounded-md border">
					<Table.Root class="hidden md:table">
						<Table.Header>
							<Table.Row>
								<Table.Head class="w-10"></Table.Head>
								<Table.Head class="w-28">{m.common_key()}</Table.Head>
								<Table.Head>{m.common_title()}</Table.Head>
								<Table.Head class="w-28">{m.common_priority()}</Table.Head>
							</Table.Row>
						</Table.Header>
					</Table.Root>
					<VirtualList items={availableCases} rowHeight={44} height="360px">
						{#snippet children({ item })}
							{@const tc = item as (typeof availableCases)[0]}
							<button
								type="button"
								class="flex h-11 w-full items-center gap-2 px-3 text-left text-sm md:hidden"
								onclick={() => toggleAddCase(tc.id)}
							>
								<input
									type="checkbox"
									checked={addCasesSelected.has(tc.id)}
									onchange={() => toggleAddCase(tc.id)}
									onclick={(e: MouseEvent) => e.stopPropagation()}
									class="rounded"
									aria-label={tc.key}
								/>
								<span class="w-16 shrink-0 font-mono text-xs text-muted-foreground">{tc.key}</span>
								<span class="min-w-0 flex-1 truncate font-medium">{tc.title}</span>
							</button>
							<Table.Root class="hidden md:table">
								<Table.Body>
									<Table.Row class="cursor-pointer" onclick={() => toggleAddCase(tc.id)}>
										<Table.Cell class="w-10">
											<input
												type="checkbox"
												checked={addCasesSelected.has(tc.id)}
												onchange={() => toggleAddCase(tc.id)}
												onclick={(e: MouseEvent) => e.stopPropagation()}
												class="rounded"
											/>
										</Table.Cell>
										<Table.Cell class="w-28 font-mono text-sm">{tc.key}</Table.Cell>
										<Table.Cell class="font-medium">{tc.title}</Table.Cell>
										<Table.Cell class="w-28">
											<PriorityBadge name={tc.priority} color={getPriorityColor(tc.priority)} />
										</Table.Cell>
									</Table.Row>
								</Table.Body>
							</Table.Root>
						{/snippet}
					</VirtualList>
				</div>
			</div>
			<Dialog.Footer>
				<Button
					variant="outline"
					class="w-full sm:w-auto"
					onclick={() => (addCasesDialogOpen = false)}>{m.common_cancel()}</Button
				>
				<Button
					class="w-full sm:w-auto"
					onclick={handleAddCases}
					disabled={addCasesSaving || addCasesSelected.size === 0}
				>
					{addCasesSaving ? m.common_saving() : m.suite_add_cases()} ({addCasesSelected.size})
				</Button>
			</Dialog.Footer>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
