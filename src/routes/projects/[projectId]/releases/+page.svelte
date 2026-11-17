<script lang="ts">
	import { isInteractiveTarget } from '$lib/utils';
	import PageHeader from '$lib/components/patterns/PageHeader.svelte';
	import StatusFilter from '$lib/components/patterns/StatusFilter.svelte';
	import EmptyState from '$lib/components/patterns/EmptyState.svelte';
	import { page } from '$app/state';
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
	const canDelete = $derived(data.userRole === 'PROJECT_ADMIN' || data.userRole === 'ADMIN');

	const statusFilter = $derived(page.url.searchParams.get('status') ?? '');
	function setStatusFilter(status: string) {
		const params = new URLSearchParams(page.url.searchParams);
		if (status) params.set('status', status);
		else params.delete('status');
		goto(`${page.url.pathname}${params.size ? `?${params}` : ''}`, {
			keepFocus: true,
			noScroll: true
		});
	}

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
			case 'PLANNING':
				return 'outline';
			case 'IN_PROGRESS':
				return 'secondary';
			case 'READY':
				return 'default';
			case 'RELEASED':
				return 'default';
			default:
				return 'outline';
		}
	}

	const filteredReleases = $derived(
		statusFilter ? data.releases.filter((r) => r.status === statusFilter) : data.releases
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

<div class="space-y-6">
	<PageHeader title={m.rel_title()}>
		{#snippet actions()}{#if canManage}<Button class="w-full sm:w-auto" onclick={openCreate}
					>{m.rel_new()}</Button
				>{/if}{/snippet}
	</PageHeader>

	<StatusFilter
		value={statusFilter}
		onchange={setStatusFilter}
		options={['', ...statuses].map((value) => ({
			value,
			label: value ? statusLabel(value) : m.common_all()
		}))}
	/>

	{#if filteredReleases.length === 0}
		<EmptyState
			title={statusFilter ? m.ui_no_filtered_results() : m.rel_empty_title()}
			description={statusFilter ? m.ui_no_filtered_description() : m.rel_empty_create()}
		>
			{#snippet actions()}
				{#if statusFilter}<Button variant="outline" onclick={() => setStatusFilter('')}
						>{m.ui_clear_filters()}</Button
					>
				{:else if canManage}<Button class="w-full sm:w-auto" onclick={openCreate}
						>{m.rel_create()}</Button
					>{/if}
			{/snippet}
		</EmptyState>
	{:else}
		<div class="grid gap-3 md:hidden">
			{#each filteredReleases as rel (rel.id)}
				<div class="rounded-md border p-3 transition-colors hover:bg-muted/50">
					<div class="flex items-start justify-between gap-3">
						<a class="min-w-0 flex-1 text-left" href={`${basePath}/${rel.id}`}>
							<div class="break-words font-medium">{rel.name}</div>
							<div class="mt-1 flex flex-wrap items-center gap-2">
								{#if rel.version}
									<Badge variant="outline">{rel.version}</Badge>
								{/if}
								<Badge variant={statusVariant(rel.status)}>{statusLabel(rel.status)}</Badge>
							</div>
						</a>
						{#if canDelete}
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
									<DropdownMenu.Item onclick={() => goto(`${basePath}/${rel.id}`)}>
										{m.common_edit()}
									</DropdownMenu.Item>
									<DropdownMenu.Separator />
									<DropdownMenu.Item
										class="text-destructive"
										onclick={() => {
											openDelete(rel.id);
										}}
									>
										{m.common_delete()}
									</DropdownMenu.Item>
								</DropdownMenu.Content>
							</DropdownMenu.Root>
						{/if}
					</div>
					<div class="mt-3 grid grid-cols-1 gap-2 text-xs min-[360px]:grid-cols-3">
						<div>
							<div class="text-muted-foreground">{m.rel_target_date()}</div>
							<div>{formatDate(rel.targetDate)}</div>
						</div>
						<div>
							<div class="text-muted-foreground">{m.nav_test_plans()}</div>
							<div>{rel.planCount}</div>
						</div>
						<div>
							<div class="text-muted-foreground">{m.nav_test_runs()}</div>
							<div>{rel.runCount}</div>
						</div>
					</div>
				</div>
			{/each}
		</div>
		<div class="hidden overflow-hidden rounded-md border md:block">
			<Table.Root class="table-fixed">
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
							onclick={(event) => {
								if (!isInteractiveTarget(event.target)) goto(`${basePath}/${rel.id}`);
							}}
						>
							<Table.Cell class="py-1 px-2 text-xs font-medium">
								<a
									href={`${basePath}/${rel.id}`}
									class="block truncate underline-offset-4 hover:underline"
									title={rel.name}>{rel.name}</a
								>
							</Table.Cell>
							<Table.Cell class="text-muted-foreground py-1 px-2 text-xs">
								<span class="block truncate" title={rel.version ?? '-'}>{rel.version ?? '-'}</span>
							</Table.Cell>
							<Table.Cell class="py-1 px-2 text-xs">
								<Badge variant={statusVariant(rel.status)}>{statusLabel(rel.status)}</Badge>
							</Table.Cell>
							<Table.Cell class="text-muted-foreground py-1 px-2 text-xs"
								>{formatDate(rel.targetDate)}</Table.Cell
							>
							<Table.Cell class="py-1 px-2 text-xs">{rel.planCount}</Table.Cell>
							<Table.Cell class="py-1 px-2 text-xs">{rel.runCount}</Table.Cell>
							<Table.Cell class="text-muted-foreground py-1 px-2 text-xs">
								<span class="block truncate" title={rel.createdBy}>{rel.createdBy}</span>
							</Table.Cell>
							{#if canDelete}
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
											<DropdownMenu.Item onclick={() => goto(`${basePath}/${rel.id}`)}>
												{m.common_edit()}
											</DropdownMenu.Item>
											<DropdownMenu.Separator />
											<DropdownMenu.Item
												class="text-destructive"
												onclick={() => {
													openDelete(rel.id);
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
					<Input
						id="relVersion"
						bind:value={createVersion}
						placeholder={m.rel_version_placeholder()}
					/>
				</div>
				<div class="space-y-2">
					<Label for="relDesc">{m.common_description()}</Label>
					<Input id="relDesc" bind:value={createDesc} />
				</div>
			</div>
			<Dialog.Footer>
				<Button
					variant="outline"
					class="w-full sm:w-auto"
					onclick={() => (createDialogOpen = false)}>{m.common_cancel()}</Button
				>
				<Button
					class="w-full sm:w-auto"
					onclick={handleCreate}
					disabled={createSaving || !createName.trim()}
				>
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
