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
	import { apiFetch } from '$lib/api-client';
	import * as m from '$lib/paraglide/messages.js';
	import { REQUIREMENT_LIMITS } from '$lib/requirement-limits';
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

	type Draft = { title: string; externalId: string; source: string; description: string };
	type Removal = { requirement: Requirement; caseId?: number; caseKey?: string };
	const requirementsEndpoint = $derived(`/api/projects/${projectId}/requirements`);
	let newButton = $state<HTMLElement | null>(null);
	let formOpen = $state(false);
	let editing = $state<Requirement | null>(null);
	let draft = $state<Draft>({ title: '', externalId: '', source: '', description: '' });
	let formSaving = $state(false);
	let titleInvalid = $state(false);
	let formFailed = $state(false);
	let titleInput = $state<HTMLInputElement | null>(null);
	let formError = $state<HTMLElement | null>(null);
	let formTrigger: HTMLElement | null = null;

	let removalOpen = $state(false);
	let removal = $state<Removal | null>(null);
	let removalSaving = $state(false);
	let removalFailed = $state(false);
	let removalError = $state<HTMLElement | null>(null);
	let removalTrigger: HTMLElement | null = null;

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

	function openForm(trigger: HTMLElement, req: Requirement | null = null) {
		formTrigger = trigger;
		editing = req;
		draft = {
			title: req?.title ?? '',
			externalId: req?.externalId ?? '',
			source: req?.source ?? '',
			description: req?.description ?? ''
		};
		titleInvalid = false;
		formFailed = false;
		formOpen = true;
	}

	function restoreFocus(event: Event, trigger: HTMLElement | null) {
		event.preventDefault();
		(trigger?.isConnected ? trigger : newButton)?.focus();
	}

	async function saveRequirement(event: SubmitEvent) {
		event.preventDefault();
		if (formSaving) return;
		const title = draft.title.trim();
		titleInvalid = !title;
		formFailed = false;
		if (titleInvalid) {
			await tick();
			titleInput?.focus();
			return;
		}
		formSaving = true;
		try {
			await apiFetch(editing ? `${requirementsEndpoint}/${editing.id}` : requirementsEndpoint, {
				method: editing ? 'PATCH' : 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					title,
					externalId: draft.externalId.trim() || null,
					source: draft.source.trim() || null,
					description: draft.description.trim() || null
				}),
				silent: true
			});
			await loadRequirements();
			formOpen = false;
			toast.success(m.req_saved());
		} catch {
			formFailed = true;
			await tick();
			formError?.focus();
		} finally {
			formSaving = false;
		}
	}

	function openRemoval(trigger: HTMLElement, requirement: Requirement, tc?: LinkedTestCase) {
		removalTrigger = trigger;
		removal = { requirement, caseId: tc?.id, caseKey: tc?.key };
		removalFailed = false;
		removalOpen = true;
	}

	async function removeRequirementOrLink() {
		if (!removal || removalSaving) return;
		const { requirement, caseId } = removal;
		const url = `${requirementsEndpoint}/${requirement.id}`;
		removalSaving = true;
		removalFailed = false;
		try {
			await apiFetch(caseId ? `${url}/test-cases?testCaseId=${caseId}` : url, {
				method: 'DELETE',
				silent: true
			});
			if (caseId) {
				removalTrigger = document.getElementById(`requirement-toggle-${requirement.id}`);
			} else {
				removalTrigger = null;
				requirements = requirements.filter((req) => req.id !== requirement.id);
				if (expandedId === requirement.id) expandedId = null;
			}
			await Promise.all([refreshMatrix(), loadRequirements()]);
			removalOpen = false;
			toast.success(caseId ? m.req_unlinked() : m.req_deleted());
		} catch {
			removalFailed = true;
			await tick();
			removalError?.focus();
		} finally {
			removalSaving = false;
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
			{#if canManage}<Button bind:ref={newButton} onclick={(event) => openForm(event.currentTarget)}
					>{m.req_new()}</Button
				>{/if}
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
								id={`requirement-toggle-${req.id}`}
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
									<Button
										variant="ghost"
										size="sm"
										onclick={(event) => openForm(event.currentTarget, req)}
										>{m.common_edit()}<span class="sr-only"> · {req.title}</span></Button
									>
									<Button
										variant="ghost"
										size="sm"
										class="text-destructive"
										onclick={(event) => openRemoval(event.currentTarget, req)}
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
																onclick={(event) => openRemoval(event.currentTarget, req, tc)}
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

{#if canManage}
	<Dialog.Root bind:open={formOpen}>
		<Dialog.Content
			showCloseButton={!formSaving}
			escapeKeydownBehavior={formSaving ? 'ignore' : 'close'}
			interactOutsideBehavior="ignore"
			onCloseAutoFocus={(event) => restoreFocus(event, formTrigger)}
		>
			<Dialog.Header>
				<Dialog.Title>{editing ? m.req_edit() : m.req_new()}</Dialog.Title>
				<Dialog.Description>{m.req_form_hint()}</Dialog.Description>
			</Dialog.Header>
			{#if formFailed}
				<p role="alert" tabindex="-1" bind:this={formError} class="text-sm text-destructive">
					{m.ui_save_failed()}
				</p>
			{/if}
			<form onsubmit={saveRequirement} aria-busy={formSaving} class="space-y-4">
				<fieldset disabled={formSaving} class="min-w-0 space-y-3">
					<div class="space-y-1">
						<Label for="requirement-title"
							>{m.common_title()}
							<span class="text-muted-foreground">({m.ui_required()})</span></Label
						>
						<Input
							id="requirement-title"
							bind:ref={titleInput}
							bind:value={draft.title}
							required
							maxlength={REQUIREMENT_LIMITS.title}
							aria-invalid={titleInvalid || undefined}
							aria-describedby={titleInvalid ? 'requirement-title-error' : undefined}
							oninput={() => (titleInvalid = false)}
						/>
						{#if titleInvalid}<p
								id="requirement-title-error"
								role="alert"
								class="text-sm text-destructive"
							>
								{m.ui_title_required()}
							</p>{/if}
					</div>
					<div class="space-y-1">
						<Label for="requirement-external-id">{m.req_external_id()}</Label>
						<Input
							id="requirement-external-id"
							bind:value={draft.externalId}
							maxlength={REQUIREMENT_LIMITS.externalId}
							placeholder={m.req_external_id_placeholder()}
						/>
					</div>
					<div class="space-y-1">
						<Label for="requirement-source">{m.req_source()}</Label>
						<Input
							id="requirement-source"
							bind:value={draft.source}
							maxlength={REQUIREMENT_LIMITS.source}
							placeholder={m.req_source_placeholder()}
						/>
					</div>
					<div class="space-y-1">
						<Label for="requirement-description">{m.req_description()}</Label>
						<Textarea
							id="requirement-description"
							bind:value={draft.description}
							maxlength={REQUIREMENT_LIMITS.description}
							rows={3}
						/>
					</div>
				</fieldset>
				<Dialog.Footer>
					<Button
						class="w-full sm:w-auto"
						variant="outline"
						disabled={formSaving}
						onclick={() => (formOpen = false)}>{m.common_cancel()}</Button
					>
					<Button class="w-full sm:w-auto" type="submit" disabled={formSaving}
						>{formSaving ? m.common_saving() : m.common_save_changes()}</Button
					>
				</Dialog.Footer>
			</form>
		</Dialog.Content>
	</Dialog.Root>

	<AlertDialog.Root bind:open={removalOpen}>
		<AlertDialog.Content
			escapeKeydownBehavior={removalSaving ? 'ignore' : 'close'}
			onCloseAutoFocus={(event) => restoreFocus(event, removalTrigger)}
		>
			<AlertDialog.Header>
				<AlertDialog.Title
					>{removal?.caseId ? m.req_unlink_test_case() : m.req_delete()}</AlertDialog.Title
				>
				<AlertDialog.Description>
					{removal?.caseKey
						? m.req_unlink_confirm({ key: removal.caseKey })
						: m.req_delete_confirm()}
				</AlertDialog.Description>
			</AlertDialog.Header>
			<p class="text-sm font-medium [overflow-wrap:anywhere]">{removal?.requirement.title}</p>
			{#if removalFailed}
				<p role="alert" tabindex="-1" bind:this={removalError} class="text-sm text-destructive">
					{m.req_remove_failed()}
				</p>
			{/if}
			<AlertDialog.Footer>
				<AlertDialog.Cancel class="w-full sm:w-auto" disabled={removalSaving}
					>{m.common_cancel()}</AlertDialog.Cancel
				>
				<Button
					variant="destructive"
					class="w-full sm:w-auto"
					disabled={removalSaving}
					onclick={removeRequirementOrLink}
				>
					{removalSaving
						? m.common_saving()
						: removal?.caseId
							? m.req_unlink_test_case()
							: m.common_delete()}
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
				{#if linkFailed}<p role="alert" class="text-sm text-destructive">
						{m.ui_save_failed()}
					</p>{/if}
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
{/if}
