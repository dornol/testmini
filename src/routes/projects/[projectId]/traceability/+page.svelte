<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import * as Table from '$lib/components/ui/table/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { apiFetch, apiPost, apiPatch, apiDelete } from '$lib/api-client';
	import * as m from '$lib/paraglide/messages.js';

	let { data } = $props();

	const projectId = $derived(data.projectId);
	const canManage = $derived(
		data.userRole === 'PROJECT_ADMIN' || data.userRole === 'QA' || data.userRole === 'ADMIN'
	);

	type Coverage = {
		pass: number;
		fail: number;
		pending: number;
		blocked: number;
		skipped: number;
		notExecuted: number;
	};

	type Requirement = {
		id: number;
		externalId: string | null;
		title: string;
		description: string | null;
		source: string | null;
		testCaseCount: number;
		coverage: Coverage;
		createdAt: string;
	};

	type LinkedTestCase = {
		id: number;
		key: string;
		title: string;
		latestStatus: string | null;
	};

	type MatrixRequirement = {
		id: number;
		externalId: string | null;
		title: string;
		source: string | null;
		testCases: LinkedTestCase[];
	};

	let requirements = $state<Requirement[]>([]);
	let loading = $state(true);
	let expandedId = $state<number | null>(null);
	let expandedTestCases = $state<LinkedTestCase[]>([]);
	let expandLoading = $state(false);

	// Create dialog
	let createDialogOpen = $state(false);
	let newTitle = $state('');
	let newExternalId = $state('');
	let newSource = $state('');
	let newDescription = $state('');
	let creating = $state(false);

	// Edit dialog
	let editDialogOpen = $state(false);
	let editId = $state<number | null>(null);
	let editTitle = $state('');
	let editExternalId = $state('');
	let editSource = $state('');
	let editDescription = $state('');
	let editSaving = $state(false);

	// Delete dialog
	let deleteDialogOpen = $state(false);
	let deleteId = $state<number | null>(null);
	let deleteSaving = $state(false);

	// Link test case dialog
	let linkDialogOpen = $state(false);
	let linkReqId = $state<number | null>(null);
	let linkSearch = $state('');
	let linkLoading = $state(false);

	const filteredTestCases = $derived(
		data.allTestCases.filter(
			(tc) =>
				!expandedTestCases.some((etc) => etc.id === tc.id) &&
				(tc.key.toLowerCase().includes(linkSearch.toLowerCase()) ||
					tc.title.toLowerCase().includes(linkSearch.toLowerCase()))
		)
	);

	async function loadRequirements() {
		loading = true;
		try {
			requirements = await apiFetch<Requirement[]>(
				`/api/projects/${projectId}/requirements`,
				{ silent: true }
			);
		} catch {
			// silenced
		} finally {
			loading = false;
		}
	}

	async function toggleExpand(reqId: number) {
		if (expandedId === reqId) {
			expandedId = null;
			expandedTestCases = [];
			return;
		}
		expandedId = reqId;
		expandLoading = true;
		try {
			const matrix = await apiFetch<{ requirements: MatrixRequirement[] }>(
				`/api/projects/${projectId}/requirements/matrix`,
				{ silent: true }
			);
			const found = matrix.requirements.find((r) => r.id === reqId);
			expandedTestCases = found?.testCases ?? [];
		} catch {
			expandedTestCases = [];
		} finally {
			expandLoading = false;
		}
	}

	async function handleCreate() {
		creating = true;
		try {
			await apiPost(`/api/projects/${projectId}/requirements`, {
				title: newTitle,
				externalId: newExternalId || undefined,
				description: newDescription || undefined,
				source: newSource || undefined
			});
			createDialogOpen = false;
			newTitle = '';
			newExternalId = '';
			newSource = '';
			newDescription = '';
			toast.success(m.req_saved());
			await loadRequirements();
		} catch {
			// error toast handled by apiPost
		} finally {
			creating = false;
		}
	}

	function openEdit(req: Requirement) {
		editId = req.id;
		editTitle = req.title;
		editExternalId = req.externalId ?? '';
		editSource = req.source ?? '';
		editDescription = req.description ?? '';
		editDialogOpen = true;
	}

	async function handleEdit() {
		if (!editId) return;
		editSaving = true;
		try {
			await apiPatch(`/api/projects/${projectId}/requirements/${editId}`, {
				title: editTitle,
				externalId: editExternalId || null,
				description: editDescription || null,
				source: editSource || null
			});
			editDialogOpen = false;
			toast.success(m.req_saved());
			await loadRequirements();
		} catch {
			// error toast handled by apiPatch
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
			await apiDelete(`/api/projects/${projectId}/requirements/${deleteId}`);
			deleteDialogOpen = false;
			if (expandedId === deleteId) {
				expandedId = null;
				expandedTestCases = [];
			}
			toast.success(m.req_deleted());
			await loadRequirements();
		} catch {
			// error toast handled by apiDelete
		} finally {
			deleteSaving = false;
		}
	}

	function openLinkDialog(reqId: number) {
		linkReqId = reqId;
		linkSearch = '';
		linkDialogOpen = true;
	}

	async function linkTestCase(testCaseId: number) {
		if (!linkReqId) return;
		linkLoading = true;
		try {
			await apiPost(
				`/api/projects/${projectId}/requirements/${linkReqId}/test-cases`,
				{ testCaseIds: [testCaseId] }
			);
			toast.success(m.req_linked());
			// Refresh
			if (expandedId === linkReqId) {
				await toggleExpand(linkReqId);
				await toggleExpand(linkReqId);
			}
			await loadRequirements();
		} catch {
			// error toast handled by apiPost
		} finally {
			linkLoading = false;
		}
	}

	async function unlinkTestCase(reqId: number, testCaseId: number) {
		try {
			await apiDelete(
				`/api/projects/${projectId}/requirements/${reqId}/test-cases?testCaseId=${testCaseId}`
			);
			toast.success(m.req_unlinked());
			expandedTestCases = expandedTestCases.filter((tc) => tc.id !== testCaseId);
			await loadRequirements();
		} catch {
			// error toast handled
		}
	}

	function exportCsv() {
		window.open(`/api/projects/${projectId}/requirements/matrix/export`, '_blank');
	}

	function statusColor(status: string | null): string {
		switch (status) {
			case 'PASS':
				return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
			case 'FAIL':
				return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
			case 'BLOCKED':
				return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
			case 'SKIPPED':
				return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
			case 'PENDING':
				return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
			default:
				return 'bg-muted text-muted-foreground';
		}
	}

	onMount(() => {
		loadRequirements();
	});
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<div>
			<h2 class="text-lg font-semibold">{m.req_title()}</h2>
			<p class="text-muted-foreground text-sm">{m.req_desc()}</p>
		</div>
		<div class="flex gap-2">
			<Button variant="outline" size="sm" onclick={exportCsv}>
				{m.req_export_matrix()}
			</Button>
			{#if canManage}
				<Button size="sm" onclick={() => (createDialogOpen = true)}>
					{m.req_new()}
				</Button>
			{/if}
		</div>
	</div>

	{#if loading}
		<div class="flex items-center justify-center p-8">
			<p class="text-muted-foreground text-sm">{m.common_loading()}</p>
		</div>
	{:else if requirements.length === 0}
		<div class="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
			<h3 class="text-lg font-semibold">{m.req_title()}</h3>
			<p class="text-muted-foreground mt-1 text-sm">{m.req_no_requirements()}</p>
			{#if canManage}
				<Button class="mt-4" onclick={() => (createDialogOpen = true)}>
					{m.req_new()}
				</Button>
			{/if}
		</div>
	{:else}
		<div class="border rounded-md overflow-hidden">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head class="py-1 px-2 text-xs w-8"></Table.Head>
						<Table.Head class="py-1 px-2 text-xs">{m.req_external_id()}</Table.Head>
						<Table.Head class="py-1 px-2 text-xs">{m.common_title()}</Table.Head>
						<Table.Head class="py-1 px-2 text-xs">{m.req_source()}</Table.Head>
						<Table.Head class="py-1 px-2 text-xs">{m.req_linked_test_cases()}</Table.Head>
						<Table.Head class="py-1 px-2 text-xs">Coverage</Table.Head>
						{#if canManage}
							<Table.Head class="py-1 px-2 text-xs w-24">{m.common_actions()}</Table.Head>
						{/if}
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each requirements as req (req.id)}
						<Table.Row
							class="cursor-pointer hover:bg-muted/50 {req.testCaseCount === 0 ? 'bg-yellow-50 dark:bg-yellow-950/20' : ''}"
							onclick={() => toggleExpand(req.id)}
						>
							<Table.Cell class="py-1 px-2 text-xs">
								<span class="inline-block transition-transform {expandedId === req.id ? 'rotate-90' : ''}">
									&#9656;
								</span>
							</Table.Cell>
							<Table.Cell class="py-1 px-2 text-xs font-mono">
								{req.externalId ?? '-'}
							</Table.Cell>
							<Table.Cell class="py-1 px-2 text-xs font-medium">
								{req.title}
							</Table.Cell>
							<Table.Cell class="py-1 px-2 text-xs text-muted-foreground">
								{req.source ?? '-'}
							</Table.Cell>
							<Table.Cell class="py-1 px-2 text-xs">
								{#if req.testCaseCount === 0}
									<Badge variant="destructive" class="text-xs">
										{m.req_no_coverage()}
									</Badge>
								{:else}
									{req.testCaseCount}
								{/if}
							</Table.Cell>
							<Table.Cell class="py-1 px-2 text-xs">
								{#if req.testCaseCount > 0}
									<div class="flex gap-1 flex-wrap">
										{#if req.coverage.pass > 0}
											<span class="inline-flex items-center rounded px-1 text-[10px] font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
												P:{req.coverage.pass}
											</span>
										{/if}
										{#if req.coverage.fail > 0}
											<span class="inline-flex items-center rounded px-1 text-[10px] font-medium bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
												F:{req.coverage.fail}
											</span>
										{/if}
										{#if req.coverage.pending > 0}
											<span class="inline-flex items-center rounded px-1 text-[10px] font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
												W:{req.coverage.pending}
											</span>
										{/if}
										{#if req.coverage.blocked > 0}
											<span class="inline-flex items-center rounded px-1 text-[10px] font-medium bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200">
												B:{req.coverage.blocked}
											</span>
										{/if}
										{#if req.coverage.skipped > 0}
											<span class="inline-flex items-center rounded px-1 text-[10px] font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200">
												S:{req.coverage.skipped}
											</span>
										{/if}
										{#if req.coverage.notExecuted > 0}
											<span class="inline-flex items-center rounded px-1 text-[10px] font-medium bg-muted text-muted-foreground">
												N:{req.coverage.notExecuted}
											</span>
										{/if}
									</div>
								{:else}
									<Badge variant="outline" class="text-[10px]">{m.req_coverage_gap()}</Badge>
								{/if}
							</Table.Cell>
							{#if canManage}
								<Table.Cell class="py-1 px-2 text-xs">
									<div class="flex gap-1">
										<Button
											variant="ghost"
											size="sm"
											class="h-6 px-1 text-xs"
											onclick={(e: MouseEvent) => {
												e.stopPropagation();
												openLinkDialog(req.id);
											}}
										>
											+
										</Button>
										<Button
											variant="ghost"
											size="sm"
											class="h-6 px-1 text-xs"
											onclick={(e: MouseEvent) => {
												e.stopPropagation();
												openEdit(req);
											}}
										>
											{m.common_edit()}
										</Button>
										<Button
											variant="ghost"
											size="sm"
											class="h-6 px-1 text-xs text-destructive"
											onclick={(e: MouseEvent) => {
												e.stopPropagation();
												openDelete(req.id);
											}}
										>
											{m.common_delete()}
										</Button>
									</div>
								</Table.Cell>
							{/if}
						</Table.Row>

						{#if expandedId === req.id}
							<Table.Row>
								<Table.Cell colspan={canManage ? 7 : 6} class="bg-muted/30 p-3">
									{#if expandLoading}
										<p class="text-muted-foreground text-xs">{m.common_loading()}</p>
									{:else if expandedTestCases.length === 0}
										<p class="text-muted-foreground text-xs">{m.req_no_coverage()}</p>
									{:else}
										<div class="space-y-1">
											<p class="text-xs font-medium mb-2">{m.req_linked_test_cases()}</p>
											{#each expandedTestCases as tc (tc.id)}
												<div class="flex items-center gap-2 text-xs py-0.5">
													<span class="font-mono text-muted-foreground">{tc.key}</span>
													<span>{tc.title}</span>
													<Badge class="text-[10px] {statusColor(tc.latestStatus)}">
														{tc.latestStatus ?? 'N/A'}
													</Badge>
													{#if canManage}
														<Button
															variant="ghost"
															size="sm"
															class="h-5 px-1 text-[10px] text-destructive ml-auto"
															onclick={() => unlinkTestCase(req.id, tc.id)}
														>
															{m.req_unlink_test_case()}
														</Button>
													{/if}
												</div>
											{/each}
										</div>
									{/if}
								</Table.Cell>
							</Table.Row>
						{/if}
					{/each}
				</Table.Body>
			</Table.Root>
		</div>
	{/if}
</div>

<!-- Create Requirement Dialog -->
<Dialog.Root bind:open={createDialogOpen}>
	<Dialog.Portal>
		<Dialog.Overlay />
		<Dialog.Content class="sm:max-w-md">
			<Dialog.Header>
				<Dialog.Title>{m.req_new()}</Dialog.Title>
			</Dialog.Header>
			<div class="space-y-4 py-4">
				<div class="space-y-2">
					<Label for="reqTitle">{m.common_title()}</Label>
					<Input id="reqTitle" bind:value={newTitle} placeholder={m.common_title()} />
				</div>
				<div class="space-y-2">
					<Label for="reqExternalId">{m.req_external_id()}</Label>
					<Input
						id="reqExternalId"
						bind:value={newExternalId}
						placeholder={m.req_external_id_placeholder()}
					/>
				</div>
				<div class="space-y-2">
					<Label for="reqSource">{m.req_source()}</Label>
					<Input
						id="reqSource"
						bind:value={newSource}
						placeholder={m.req_source_placeholder()}
					/>
				</div>
				<div class="space-y-2">
					<Label for="reqDescription">{m.req_description()}</Label>
					<Textarea id="reqDescription" bind:value={newDescription} rows={3} />
				</div>
			</div>
			<Dialog.Footer>
				<Button variant="outline" onclick={() => (createDialogOpen = false)}>
					{m.common_cancel()}
				</Button>
				<Button onclick={handleCreate} disabled={creating || !newTitle.trim()}>
					{creating ? m.common_creating() : m.common_save_changes()}
				</Button>
			</Dialog.Footer>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<!-- Edit Requirement Dialog -->
<Dialog.Root bind:open={editDialogOpen}>
	<Dialog.Portal>
		<Dialog.Overlay />
		<Dialog.Content class="sm:max-w-md">
			<Dialog.Header>
				<Dialog.Title>{m.req_edit()}</Dialog.Title>
			</Dialog.Header>
			<div class="space-y-4 py-4">
				<div class="space-y-2">
					<Label for="editReqTitle">{m.common_title()}</Label>
					<Input id="editReqTitle" bind:value={editTitle} />
				</div>
				<div class="space-y-2">
					<Label for="editReqExternalId">{m.req_external_id()}</Label>
					<Input
						id="editReqExternalId"
						bind:value={editExternalId}
						placeholder={m.req_external_id_placeholder()}
					/>
				</div>
				<div class="space-y-2">
					<Label for="editReqSource">{m.req_source()}</Label>
					<Input
						id="editReqSource"
						bind:value={editSource}
						placeholder={m.req_source_placeholder()}
					/>
				</div>
				<div class="space-y-2">
					<Label for="editReqDescription">{m.req_description()}</Label>
					<Textarea id="editReqDescription" bind:value={editDescription} rows={3} />
				</div>
			</div>
			<Dialog.Footer>
				<Button variant="outline" onclick={() => (editDialogOpen = false)}>
					{m.common_cancel()}
				</Button>
				<Button onclick={handleEdit} disabled={editSaving || !editTitle.trim()}>
					{editSaving ? m.common_saving() : m.common_save_changes()}
				</Button>
			</Dialog.Footer>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<!-- Delete Requirement Dialog -->
<AlertDialog.Root bind:open={deleteDialogOpen}>
	<AlertDialog.Portal>
		<AlertDialog.Overlay />
		<AlertDialog.Content>
			<AlertDialog.Header>
				<AlertDialog.Title>{m.req_delete()}</AlertDialog.Title>
				<AlertDialog.Description>{m.req_delete_confirm()}</AlertDialog.Description>
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

<!-- Link Test Case Dialog -->
<Dialog.Root bind:open={linkDialogOpen}>
	<Dialog.Portal>
		<Dialog.Overlay />
		<Dialog.Content class="sm:max-w-lg">
			<Dialog.Header>
				<Dialog.Title>{m.req_link_test_case()}</Dialog.Title>
			</Dialog.Header>
			<div class="space-y-4 py-4">
				<Input
					bind:value={linkSearch}
					placeholder={m.req_search_test_cases()}
				/>
				<div class="max-h-60 overflow-y-auto space-y-1">
					{#each filteredTestCases.slice(0, 50) as tc (tc.id)}
						<div class="flex items-center justify-between rounded px-2 py-1 hover:bg-muted text-sm">
							<div class="flex gap-2 items-center min-w-0">
								<span class="font-mono text-xs text-muted-foreground shrink-0">{tc.key}</span>
								<span class="truncate">{tc.title}</span>
							</div>
							<Button
								variant="outline"
								size="sm"
								class="h-6 text-xs shrink-0 ml-2"
								disabled={linkLoading}
								onclick={() => linkTestCase(tc.id)}
							>
								+
							</Button>
						</div>
					{/each}
					{#if filteredTestCases.length === 0}
						<p class="text-muted-foreground text-sm text-center py-4">
							{m.common_no_results()}
						</p>
					{/if}
				</div>
			</div>
			<Dialog.Footer>
				<Button variant="outline" onclick={() => (linkDialogOpen = false)}>
					{m.common_close()}
				</Button>
			</Dialog.Footer>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
