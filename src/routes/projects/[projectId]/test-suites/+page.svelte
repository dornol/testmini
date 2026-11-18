<script lang="ts">
	import { isInteractiveTarget } from '$lib/utils';
	import PageHeader from '$lib/components/patterns/PageHeader.svelte';
	import EmptyState from '$lib/components/patterns/EmptyState.svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import * as Table from '$lib/components/ui/table/index.js';
	import TestSuiteFormDialog from '$lib/components/TestSuiteFormDialog.svelte';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as m from '$lib/paraglide/messages.js';
	import { apiDelete } from '$lib/api-client';

	let { data } = $props();

	const basePath = $derived(`/projects/${data.project.id}/test-suites`);
	const canManage = $derived(
		data.userRole === 'PROJECT_ADMIN' || data.userRole === 'QA' || data.userRole === 'ADMIN'
	);

	// Create dialog
	let createDialogOpen = $state(false);

	let editSuite = $state<(typeof data.suites)[number] | null>(null);

	// Edit dialog
	let editDialogOpen = $state(false);

	// Delete dialog
	let deleteDialogOpen = $state(false);
	let deleteId = $state<number | null>(null);
	let deleteSaving = $state(false);

	function openEdit(suite: (typeof data.suites)[0]) {
		editSuite = suite;
		editDialogOpen = true;
	}

	function openDelete(id: number) {
		deleteId = id;
		deleteDialogOpen = true;
	}

	async function handleDelete() {
		if (!deleteId) return;
		deleteSaving = true;
		try {
			await apiDelete(`/api/projects/${data.project.id}/test-suites/${deleteId}`);
			deleteDialogOpen = false;
			toast.success(m.suite_deleted());
			await invalidateAll();
		} catch {
			// error toast handled by apiDelete
		} finally {
			deleteSaving = false;
		}
	}
</script>

<div class="space-y-6">
	<PageHeader title={m.suite_title()}>
		{#snippet actions()}{#if canManage}<Button
					class="w-full sm:w-auto"
					onclick={() => (createDialogOpen = true)}>{m.suite_new()}</Button
				>{/if}{/snippet}
	</PageHeader>

	{#if data.suites.length === 0}
		<EmptyState title={m.suite_empty()} description={m.suite_empty_desc()}>
			{#snippet actions()}{#if canManage}<Button
						class="w-full sm:w-auto"
						onclick={() => (createDialogOpen = true)}>{m.suite_create()}</Button
					>{/if}{/snippet}
		</EmptyState>
	{:else}
		<div class="grid gap-3 md:hidden">
			{#each data.suites as suite (suite.id)}
				<div class="rounded-md border p-3 transition-colors hover:bg-muted/50">
					<div class="flex items-start justify-between gap-3">
						<a class="min-w-0 flex-1 text-left" href={`${basePath}/${suite.id}`}>
							<div class="font-medium">{suite.name}</div>
							<p class="text-muted-foreground mt-1 line-clamp-2 text-sm">
								{suite.description ?? '-'}
							</p>
						</a>
						<div class="w-20 shrink-0 text-right text-xs text-muted-foreground">
							<div class="font-semibold text-foreground">{suite.itemCount}</div>
							<div class="break-keep leading-tight">{m.nav_test_cases()}</div>
						</div>
					</div>
					<div
						class="mt-3 flex flex-col gap-2 text-xs text-muted-foreground min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between"
					>
						<span class="min-w-0 break-words">{m.tr_created_by()}: {suite.createdBy}</span>
						{#if canManage}
							<DropdownMenu.Root>
								<DropdownMenu.Trigger>
									{#snippet child({ props })}
										<Button
											variant="ghost"
											size="sm"
											class="h-8 w-8 p-0"
											{...props}
											onclick={(e: MouseEvent) => e.stopPropagation()}
											aria-label={m.common_actions()}
										>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												width="14"
												height="14"
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												stroke-width="2"
												stroke-linecap="round"
												stroke-linejoin="round"
												aria-hidden="true"
												><circle cx="12" cy="12" r="1" /><circle cx="12" cy="5" r="1" /><circle
													cx="12"
													cy="19"
													r="1"
												/></svg
											>
										</Button>
									{/snippet}
								</DropdownMenu.Trigger>
								<DropdownMenu.Content align="end">
									<DropdownMenu.Item
										onclick={() => {
											openEdit(suite);
										}}
									>
										{m.common_edit()}
									</DropdownMenu.Item>
									<DropdownMenu.Separator />
									<DropdownMenu.Item
										class="text-destructive"
										onclick={() => {
											openDelete(suite.id);
										}}
									>
										{m.common_delete()}
									</DropdownMenu.Item>
								</DropdownMenu.Content>
							</DropdownMenu.Root>
						{/if}
					</div>
				</div>
			{/each}
		</div>
		<div class="hidden overflow-x-auto rounded-md border md:block">
			<Table.Root class="min-w-[640px] table-fixed">
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
							onclick={(event) => {
								if (!isInteractiveTarget(event.target)) goto(`${basePath}/${suite.id}`);
							}}
						>
							<Table.Cell class="min-w-0 py-1 px-2 text-xs font-medium">
								<a
									href={`${basePath}/${suite.id}`}
									class="block truncate underline-offset-4 hover:underline"
									title={suite.name}>{suite.name}</a
								>
							</Table.Cell>
							<Table.Cell class="min-w-0 py-1 px-2 text-xs text-muted-foreground">
								<div class="truncate" title={suite.description ?? '-'}>
									{suite.description ?? '-'}
								</div>
							</Table.Cell>
							<Table.Cell class="py-1 px-2 text-xs">{suite.itemCount}</Table.Cell>
							<Table.Cell class="min-w-0 py-1 px-2 text-xs text-muted-foreground">
								<div class="truncate" title={suite.createdBy}>{suite.createdBy}</div>
							</Table.Cell>
							{#if canManage}
								<Table.Cell class="py-1 px-2">
									<DropdownMenu.Root>
										<DropdownMenu.Trigger>
											{#snippet child({ props })}
												<Button
													variant="ghost"
													size="sm"
													class="h-6 w-6 p-0"
													{...props}
													onclick={(e: MouseEvent) => e.stopPropagation()}
													aria-label={m.common_actions()}
												>
													<svg
														xmlns="http://www.w3.org/2000/svg"
														width="14"
														height="14"
														viewBox="0 0 24 24"
														fill="none"
														stroke="currentColor"
														stroke-width="2"
														stroke-linecap="round"
														stroke-linejoin="round"
														aria-hidden="true"
														><circle cx="12" cy="12" r="1" /><circle cx="12" cy="5" r="1" /><circle
															cx="12"
															cy="19"
															r="1"
														/></svg
													>
												</Button>
											{/snippet}
										</DropdownMenu.Trigger>
										<DropdownMenu.Content align="end">
											<DropdownMenu.Item
												onclick={() => {
													openEdit(suite);
												}}
											>
												{m.common_edit()}
											</DropdownMenu.Item>
											<DropdownMenu.Separator />
											<DropdownMenu.Item
												class="text-destructive"
												onclick={() => {
													openDelete(suite.id);
												}}
											>
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
<TestSuiteFormDialog
	bind:open={createDialogOpen}
	projectId={data.project.id}
	onSaved={invalidateAll}
/>
<TestSuiteFormDialog
	bind:open={editDialogOpen}
	projectId={data.project.id}
	suite={editSuite}
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
