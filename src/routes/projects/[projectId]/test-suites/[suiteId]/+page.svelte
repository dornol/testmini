<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import PriorityBadge from '$lib/components/PriorityBadge.svelte';
	import TestSuiteFormDialog from '$lib/components/TestSuiteFormDialog.svelte';
	import TestCasePicker from '$lib/components/patterns/TestCasePicker.svelte';
	import * as m from '$lib/paraglide/messages.js';
	import { apiDelete, apiPost, apiFetch } from '$lib/api-client';

	type ProjectPriority = { name: string; color: string };

	let { data } = $props();

	const basePath = $derived(`/projects/${data.project.id}/test-suites`);
	const canManage = $derived(
		data.userRole === 'PROJECT_ADMIN' || data.userRole === 'QA' || data.userRole === 'ADMIN'
	);

	// Edit suite
	let editDialogOpen = $state(false);

	// Delete suite
	let deleteDialogOpen = $state(false);
	let deleteSaving = $state(false);

	// Add cases dialog
	let addCasesDialogOpen = $state(false);
	let addCasesSelected = $state<Set<number>>(new Set());
	let addCasesSaving = $state(false);

	const suiteItemTcIds = $derived(new Set(data.items.map((i) => i.testCaseId)));

	const availableCases = $derived(data.allTestCases.filter((tc) => !suiteItemTcIds.has(tc.id)));
	function openEdit() {
		editDialogOpen = true;
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
		addCasesSelected = new Set();
		addCasesDialogOpen = true;
	}

	async function handleAddCases() {
		if (addCasesSaving || addCasesSelected.size === 0 || addCasesSelected.size > 500) return;
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
						<span class="max-w-[40%] shrink-0">
							<PriorityBadge name={item.priority} color={getPriorityColor(item.priority)} />
						</span>
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
		<Card.Root class="hidden overflow-x-auto md:block">
			<Table.Root class="min-w-[560px] table-fixed">
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
							<Table.Cell class="min-w-0 font-medium">
								<div class="truncate" title={item.title}>{item.title}</div>
							</Table.Cell>
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
<TestSuiteFormDialog
	bind:open={editDialogOpen}
	projectId={data.project.id}
	suite={data.suite}
	onSaved={invalidateAll}
/>

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
			<div class="min-h-0 overflow-y-auto py-2">
				{#if addCasesDialogOpen}
					<TestCasePicker
						id="suite-add-cases"
						cases={availableCases}
						bind:selected={addCasesSelected}
						priorities={data.projectPriorities}
						disabled={addCasesSaving}
					/>
				{/if}
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
					disabled={addCasesSaving || addCasesSelected.size === 0 || addCasesSelected.size > 500}
				>
					{addCasesSaving ? m.common_saving() : m.suite_add_cases()} ({addCasesSelected.size})
				</Button>
			</Dialog.Footer>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
