<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { toast } from 'svelte-sonner';
	import * as Table from '$lib/components/ui/table/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import PageHeader from '$lib/components/patterns/PageHeader.svelte';
	import EmptyState from '$lib/components/patterns/EmptyState.svelte';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import '$lib/components/reports/report-results.css';
	import type { PageData } from './$types';
	import { apiFetch, apiPost, apiPatch, apiDelete } from '$lib/api-client';
	import * as m from '$lib/paraglide/messages.js';
	import { statusColorBadge } from '$lib/execution-status';

	let { data }: { data: PageData } = $props();

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

	type Matrix = { requirements: Array<{ id: number; testCases: LinkedTestCase[] }> };

	let requirements = $state<Requirement[]>([]);
	let loading = $state(true);
	let loadFailed = $state(false);
	let expandedId = $state<number | null>(null);
	let matrix = $state<Matrix | null>(null);
	let matrixLoading = $state(false);
	let matrixFailed = $state(false);
	let matrixRequest: Promise<Matrix> | undefined;
	const expandedTestCases = $derived(
		matrix?.requirements.find((row) => row.id === expandedId)?.testCases ?? []
	);
	const linkedIds = $derived(
		new Set(matrix?.requirements.find((row) => row.id === linkReqId)?.testCases.map((tc) => tc.id))
	);
	const statuses = $derived([
		{ key: 'pass', status: 'PASS', label: m.dashboard_pass() },
		{ key: 'fail', status: 'FAIL', label: m.dashboard_fail() },
		{ key: 'pending', status: 'PENDING', label: m.dashboard_pending() },
		{ key: 'blocked', status: 'BLOCKED', label: m.dashboard_blocked() },
		{ key: 'skipped', status: 'SKIPPED', label: m.dashboard_skipped() },
		{ key: 'notExecuted', status: null, label: m.req_not_executed() }
	] as const);

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

	// Unlink confirmation dialog
	let unlinkDialogOpen = $state(false);
	let unlinkReqId = $state<number | null>(null);
	let unlinkTestCaseId = $state<number | null>(null);
	let unlinkTestCaseKey = $state('');
	let unlinkSaving = $state(false);

	// Link test case dialog
	let linkDialogOpen = $state(false);
	let linkReqId = $state<number | null>(null);
	let linkSearch = $state('');
	let linkLoading = $state(false);
	let linkFailed = $state(false);
	let searchInput = $state<HTMLInputElement | null>(null);
	let linkDisplayCount = $state(50);

	const filteredTestCases = $derived(
		data.allTestCases.filter(
			(tc) =>
				!linkedIds.has(tc.id) &&
				(tc.key.toLowerCase().includes(linkSearch.trim().toLowerCase()) ||
					tc.title.toLowerCase().includes(linkSearch.trim().toLowerCase()))
		)
	);

	async function loadRequirements() {
		loading = true;
		loadFailed = false;
		try {
			requirements = await apiFetch<Requirement[]>(`/api/projects/${projectId}/requirements`, {
				silent: true
			});
		} catch {
			loadFailed = true;
		} finally {
			loading = false;
		}
	}

	function toggleExpand(reqId: number) {
		expandedId = expandedId === reqId ? null : reqId;
		if (expandedId !== null && !matrix) void loadMatrix();
	}

	async function loadMatrix() {
		if (matrixRequest) return;
		matrixLoading = true;
		matrixFailed = false;
		const request = apiFetch<Matrix>(`/api/projects/${projectId}/requirements/matrix`, {
			silent: true
		});
		matrixRequest = request;
		try {
			const result = await request;
			if (matrixRequest === request) matrix = result;
		} catch {
			if (matrixRequest === request) matrixFailed = true;
		} finally {
			if (matrixRequest === request) {
				matrixRequest = undefined;
				matrixLoading = false;
			}
		}
	}

	async function refreshMatrix() {
		matrix = null;
		matrixRequest = undefined;
		matrixFailed = false;
		matrixLoading = false;
		if (expandedId !== null || linkDialogOpen) await loadMatrix();
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
			}
			toast.success(m.req_deleted());
			await Promise.all([refreshMatrix(), loadRequirements()]);
		} catch {
			// error toast handled by apiDelete
		} finally {
			deleteSaving = false;
		}
	}

	function openLinkDialog(reqId: number) {
		linkReqId = reqId;
		linkSearch = '';
		linkDisplayCount = 50;
		linkFailed = false;
		linkDialogOpen = true;
		if (!matrix) void loadMatrix();
	}

	async function linkTestCase(testCaseId: number) {
		if (!linkReqId || !matrix || linkLoading || linkedIds.has(testCaseId)) return;
		linkLoading = true;
		linkFailed = false;
		try {
			await apiFetch(`/api/projects/${projectId}/requirements/${linkReqId}/test-cases`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ testCaseIds: [testCaseId] }),
				silent: true
			});
			toast.success(m.req_linked());
			await Promise.all([refreshMatrix(), loadRequirements()]);
			await tick();
			searchInput?.focus();
		} catch {
			linkFailed = true;
		} finally {
			linkLoading = false;
		}
	}

	function openUnlink(reqId: number, tc: LinkedTestCase) {
		unlinkReqId = reqId;
		unlinkTestCaseId = tc.id;
		unlinkTestCaseKey = tc.key;
		unlinkDialogOpen = true;
	}

	async function handleUnlink() {
		if (!unlinkReqId || !unlinkTestCaseId) return;
		unlinkSaving = true;
		try {
			await apiDelete(
				`/api/projects/${projectId}/requirements/${unlinkReqId}/test-cases?testCaseId=${unlinkTestCaseId}`
			);
			unlinkDialogOpen = false;
			toast.success(m.req_unlinked());
			await Promise.all([refreshMatrix(), loadRequirements()]);
		} catch {
			// error toast handled by apiDelete
		} finally {
			unlinkSaving = false;
		}
	}

	onMount(() => {
		loadRequirements();
	});
</script>

{#snippet mobileLabel(label: string)}
	<span aria-hidden="true" class="block text-xs text-muted-foreground sm:hidden">{label}</span>
{/snippet}

{#snippet matrixError()}
	<div class="space-y-2">
		<p role="alert" class="text-sm text-destructive">{m.req_links_load_failed()}</p>
		<Button variant="outline" size="sm" onclick={loadMatrix}>{m.ui_try_again()}</Button>
	</div>
{/snippet}

<div class="space-y-4">
	<PageHeader title={m.req_title()} description={m.req_desc()}>
		{#snippet actions()}
			<Button variant="outline" href={`/api/projects/${projectId}/requirements/matrix/export`}
				>{m.req_export_matrix()}</Button
			>
			{#if canManage}<Button onclick={() => (createDialogOpen = true)}>{m.req_new()}</Button>{/if}
		{/snippet}
	</PageHeader>

	{#if loadFailed}
		<div class="space-y-2 rounded-lg border bg-card p-4">
			<p role="alert" class="text-sm text-destructive">{m.req_list_load_failed()}</p>
			<Button variant="outline" onclick={loadRequirements}>{m.ui_try_again()}</Button>
		</div>
	{/if}

	{#if loading && !requirements.length}
		<p role="status" class="p-4 text-sm text-muted-foreground">{m.common_loading()}</p>
	{:else if !requirements.length && !loadFailed}
		<EmptyState
			title={m.req_empty_title()}
			description={canManage ? m.req_no_requirements() : m.req_empty_viewer()}
		/>
	{/if}

	{#if requirements.length}
		<Table.Root
			role="table"
			aria-label={m.req_title()}
			class="report-metrics sm:min-w-[42rem]"
			aria-busy={loading}
		>
			<Table.Header role="rowgroup">
				<Table.Row role="row">
					{#each [m.common_title(), m.req_source(), m.req_linked_test_cases(), m.req_coverage()] as label (label)}
						<Table.Head role="columnheader" scope="col">{label}</Table.Head>
					{/each}
					{#if canManage}<Table.Head role="columnheader" scope="col"
							>{m.common_actions()}</Table.Head
						>{/if}
				</Table.Row>
			</Table.Header>
			<Table.Body role="rowgroup">
				{#each requirements as req (req.id)}
					<Table.Row role="row">
						<Table.Head
							role="rowheader"
							scope="row"
							class="report-metric-wide h-auto max-w-80 whitespace-normal p-2 text-foreground"
						>
							<button
								type="button"
								class="flex min-w-0 items-start gap-2 rounded-sm text-left font-medium hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
								aria-expanded={expandedId === req.id}
								aria-controls={expandedId === req.id ? `requirement-links-${req.id}` : undefined}
								onclick={() => toggleExpand(req.id)}
							>
								<ChevronRight
									aria-hidden="true"
									class="mt-0.5 size-4 shrink-0 {expandedId === req.id ? 'rotate-90' : ''}"
								/>
								<span class="min-w-0">
									{#if req.externalId}<span class="block text-xs text-muted-foreground"
											>{req.externalId}</span
										>{/if}
									{req.title}
								</span>
							</button>
						</Table.Head>
						<Table.Cell role="cell" class="max-w-40 whitespace-normal">
							{@render mobileLabel(m.req_source())}{req.source ?? '—'}
						</Table.Cell>
						<Table.Cell role="cell">
							{@render mobileLabel(m.req_linked_test_cases())}{req.testCaseCount}
						</Table.Cell>
						<Table.Cell role="cell" class="report-metric-wide whitespace-normal">
							{@render mobileLabel(m.req_coverage())}
							{#if !req.testCaseCount}
								<span class="text-sm text-muted-foreground">{m.req_no_coverage()}</span>
							{:else}
								<div class="flex flex-wrap gap-1">
									{#each statuses as { key, status, label } (key)}
										{#if req.coverage[key] > 0}
											<Badge variant="outline" class={statusColorBadge(status)}
												>{label} {req.coverage[key]}</Badge
											>
										{/if}
									{/each}
								</div>
							{/if}
						</Table.Cell>
						{#if canManage}
							<Table.Cell role="cell" class="report-metric-wide">
								<div class="flex flex-wrap gap-1">
									<Button variant="outline" size="sm" onclick={() => openLinkDialog(req.id)}
										>{m.req_link_test_case()}<span class="sr-only"> · {req.title}</span></Button
									>
									<Button variant="ghost" size="sm" onclick={() => openEdit(req)}
										>{m.common_edit()}<span class="sr-only"> · {req.title}</span></Button
									>
									<Button
										variant="ghost"
										size="sm"
										class="text-destructive"
										onclick={() => openDelete(req.id)}
										>{m.common_delete()}<span class="sr-only"> · {req.title}</span></Button
									>
								</div>
							</Table.Cell>
						{/if}
					</Table.Row>
					{#if expandedId === req.id}
						<Table.Row role="row">
							<Table.Cell
								role="cell"
								colspan={canManage ? 5 : 4}
								class="report-metric-wide whitespace-normal bg-muted/30"
							>
								<div id={`requirement-links-${req.id}`} class="space-y-2 p-1">
									<h3 class="text-sm font-medium">{m.req_linked_test_cases()}</h3>
									{#if req.description}<p class="whitespace-pre-wrap text-sm text-muted-foreground">
											{req.description}
										</p>{/if}
									{#if matrixLoading}
										<p role="status" class="text-sm text-muted-foreground">{m.common_loading()}</p>
									{:else if matrixFailed}
										{@render matrixError()}
									{:else if !expandedTestCases.length}
										<p class="text-sm text-muted-foreground">{m.req_no_coverage()}</p>
									{:else}
										<ul class="divide-y text-sm">
											{#each expandedTestCases as tc (tc.id)}
												<li class="flex flex-wrap items-center justify-between gap-2 py-2">
													<a
														class="min-w-0 rounded-sm font-medium hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
														href={`/projects/${projectId}/test-cases/${tc.id}`}
													>
														<span class="text-xs text-muted-foreground">{tc.key}</span>
														{tc.title}
													</a>
													<div class="flex flex-wrap items-center gap-2">
														<Badge variant="outline" class={statusColorBadge(tc.latestStatus)}
															>{statuses.find((status) => status.status === tc.latestStatus)
																?.label ?? tc.latestStatus}</Badge
														>
														{#if canManage}<Button
																variant="ghost"
																size="sm"
																onclick={() => openUnlink(req.id, tc)}
																>{m.req_unlink_test_case()}<span class="sr-only">
																	· {tc.key}</span
																></Button
															>{/if}
													</div>
												</li>
											{/each}
										</ul>
									{/if}
								</div>
							</Table.Cell>
						</Table.Row>
					{/if}
				{/each}
			</Table.Body>
		</Table.Root>
	{/if}
</div>

<!-- Create Requirement Dialog -->
<Dialog.Root bind:open={createDialogOpen}>
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
				<Input id="reqSource" bind:value={newSource} placeholder={m.req_source_placeholder()} />
			</div>
			<div class="space-y-2">
				<Label for="reqDescription">{m.req_description()}</Label>
				<Textarea id="reqDescription" bind:value={newDescription} rows={3} />
			</div>
		</div>
		<Dialog.Footer>
			<Button class="w-full sm:w-auto" variant="outline" onclick={() => (createDialogOpen = false)}>
				{m.common_cancel()}
			</Button>
			<Button
				class="w-full sm:w-auto"
				onclick={handleCreate}
				disabled={creating || !newTitle.trim()}
			>
				{creating ? m.common_creating() : m.common_save_changes()}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<!-- Edit Requirement Dialog -->
<Dialog.Root bind:open={editDialogOpen}>
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
			<Button class="w-full sm:w-auto" variant="outline" onclick={() => (editDialogOpen = false)}>
				{m.common_cancel()}
			</Button>
			<Button
				class="w-full sm:w-auto"
				onclick={handleEdit}
				disabled={editSaving || !editTitle.trim()}
			>
				{editSaving ? m.common_saving() : m.common_save_changes()}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<!-- Delete Requirement Dialog -->
<AlertDialog.Root bind:open={deleteDialogOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{m.req_delete()}</AlertDialog.Title>
			<AlertDialog.Description>{m.req_delete_confirm()}</AlertDialog.Description>
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
</AlertDialog.Root>

<!-- Unlink Confirmation Dialog -->
<AlertDialog.Root bind:open={unlinkDialogOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{m.req_unlink_test_case()}</AlertDialog.Title>
			<AlertDialog.Description>
				{m.req_unlink_confirm({ key: unlinkTestCaseKey })}
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel class="w-full sm:w-auto">{m.common_cancel()}</AlertDialog.Cancel>
			<Button
				variant="destructive"
				class="w-full sm:w-auto"
				onclick={handleUnlink}
				disabled={unlinkSaving}
			>
				{unlinkSaving ? m.common_saving() : m.req_unlink_test_case()}
			</Button>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

<!-- Link Test Case Dialog -->
<Dialog.Root bind:open={linkDialogOpen}>
	<Dialog.Content
		class="sm:max-w-2xl"
		showCloseButton={!linkLoading}
		escapeKeydownBehavior={linkLoading ? 'ignore' : 'close'}
		interactOutsideBehavior="ignore"
	>
		<Dialog.Header>
			<Dialog.Title>{m.req_link_test_case()}</Dialog.Title>
			<Dialog.Description
				>{requirements.find((req) => req.id === linkReqId)?.title}</Dialog.Description
			>
		</Dialog.Header>
		{#if matrixLoading}
			<p role="status" class="text-sm text-muted-foreground">{m.common_loading()}</p>
		{:else if matrixFailed}
			{@render matrixError()}
		{:else if matrix}
			<div class="space-y-2">
				<Label for="trace-case-search">{m.ui_case_search()}</Label>
				<Input
					id="trace-case-search"
					bind:ref={searchInput}
					bind:value={linkSearch}
					oninput={() => (linkDisplayCount = 50)}
				/>
			</div>
			{#if linkFailed}<p role="alert" class="text-sm text-destructive">{m.ui_save_failed()}</p>{/if}
			<ul class="divide-y" aria-label={m.ui_case_list()}>
				{#each filteredTestCases.slice(0, linkDisplayCount) as tc (tc.id)}
					<li class="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
						<span class="min-w-0 [overflow-wrap:anywhere]">
							<span class="text-xs text-muted-foreground">{tc.key}</span>
							{tc.title}
						</span>
						<Button
							variant="outline"
							size="sm"
							disabled={linkLoading}
							onclick={() => linkTestCase(tc.id)}
						>
							{m.req_link_test_case()}<span class="sr-only"> · {tc.key} {tc.title}</span>
						</Button>
					</li>
				{/each}
			</ul>
			{#if filteredTestCases.length === 0}
				<p role="status" class="text-sm text-muted-foreground">
					{linkSearch.trim() ? m.common_no_results() : m.req_no_available_cases()}
				</p>
			{:else if linkDisplayCount < filteredTestCases.length}
				<Button variant="outline" onclick={() => (linkDisplayCount += 50)}
					>{m.req_more_cases()}</Button
				>
			{/if}
		{/if}
		<Dialog.Footer>
			<Button variant="outline" disabled={linkLoading} onclick={() => (linkDialogOpen = false)}
				>{m.common_close()}</Button
			>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
