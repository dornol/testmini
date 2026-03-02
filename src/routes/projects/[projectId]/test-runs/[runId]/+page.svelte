<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { toast } from 'svelte-sonner';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import AttachmentManager from '$lib/components/AttachmentManager.svelte';
	import { createRunEventSource } from '$lib/sse.svelte';
	import * as m from '$lib/paraglide/messages.js';

	let { data } = $props();

	// SSE real-time sync
	const sse = createRunEventSource(data.project.id, data.run.id);
	let debounceTimer: ReturnType<typeof setTimeout> | undefined;

	$effect(() => {
		sse.connect();
		return () => sse.disconnect();
	});

	$effect(() => {
		const event = sse.lastEvent;
		if (!event) return;

		clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			invalidateAll();
		}, 300);
	});

	let selectedPending = $state<Set<number>>(new Set());

	// Failure modal state
	let failDialogOpen = $state(false);
	let failExecutionId = $state<number | null>(null);
	let failExecutionKey = $state('');
	let failureEnvironment = $state('');
	let testMethod = $state('');
	let errorMessage = $state('');
	let stackTrace = $state('');
	let failComment = $state('');

	// Edit failure state
	let editFailureDialogOpen = $state(false);
	let editFailureId = $state<number | null>(null);
	let editFailureEnvironment = $state('');
	let editTestMethod = $state('');
	let editErrorMessage = $state('');
	let editStackTrace = $state('');
	let editComment = $state('');

	// View failures state
	let viewFailuresExecId = $state<number | null>(null);

	// Delete failure state
	let deleteFailureId = $state<number | null>(null);
	let deleteDialogOpen = $state(false);

	// Edit run dialog state
	let editRunDialogOpen = $state(false);
	let editRunName = $state('');
	let editRunEnv = $state('');
	let editRunSaving = $state(false);

	// Clone run dialog state
	let cloneDialogOpen = $state(false);
	let cloneRunName = $state('');
	let cloneRunSaving = $state(false);

	// Delete run dialog state
	let deleteRunDialogOpen = $state(false);
	let deleteRunSaving = $state(false);

	const run = $derived(data.run);
	const stats = $derived(data.stats);
	const canExecute = $derived(data.userRole !== 'VIEWER');
	const isAdmin = $derived(data.userRole === 'PROJECT_ADMIN' || data.userRole === 'ADMIN');
	const basePath = $derived(`/projects/${data.project.id}/test-runs`);

	const completedPct = $derived(
		stats.total > 0 ? Math.round(((stats.total - stats.pending) / stats.total) * 100) : 0
	);

	const currentPage = $derived(data.currentPage);
	const totalPages = $derived(data.totalPages);
	const statusFilter = $derived(data.statusFilter);

	const statusTabs = $derived([
		{ key: '', label: m.run_status_filter_all(), count: stats.total },
		{ key: 'PENDING', label: m.dashboard_pending(), count: stats.pending },
		{ key: 'PASS', label: m.dashboard_pass(), count: stats.pass },
		{ key: 'FAIL', label: m.dashboard_fail(), count: stats.fail },
		{ key: 'BLOCKED', label: m.dashboard_blocked(), count: stats.blocked },
		{ key: 'SKIPPED', label: m.dashboard_skipped(), count: stats.skipped }
	]);

	function setStatusFilter(status: string) {
		const params = new URLSearchParams(page.url.searchParams);
		if (status) {
			params.set('status', status);
		} else {
			params.delete('status');
		}
		params.delete('page');
		goto(`?${params.toString()}`, { keepFocus: true });
	}

	function goToPage(p: number) {
		const params = new URLSearchParams(page.url.searchParams);
		if (p > 1) {
			params.set('page', String(p));
		} else {
			params.delete('page');
		}
		goto(`?${params.toString()}`, { keepFocus: true });
	}

	const pendingExecutions = $derived(data.executions.filter((e) => e.status === 'PENDING'));

	const allPendingSelected = $derived(
		pendingExecutions.length > 0 && pendingExecutions.every((e) => selectedPending.has(e.id))
	);

	function getFailures(executionId: number) {
		return data.failures.filter((f) => f.testExecutionId === executionId);
	}

	function togglePendingAll() {
		if (allPendingSelected) {
			selectedPending = new Set();
		} else {
			selectedPending = new Set(pendingExecutions.map((e) => e.id));
		}
	}

	function togglePending(id: number) {
		const newSet = new Set(selectedPending);
		if (newSet.has(id)) {
			newSet.delete(id);
		} else {
			newSet.add(id);
		}
		selectedPending = newSet;
	}

	function openFailDialog(execId: number, key: string) {
		failExecutionId = execId;
		failExecutionKey = key;
		failureEnvironment = '';
		testMethod = '';
		errorMessage = '';
		stackTrace = '';
		failComment = '';
		failDialogOpen = true;
	}

	function openEditFailure(f: typeof data.failures[0]) {
		editFailureId = f.id;
		editFailureEnvironment = f.failureEnvironment ?? '';
		editTestMethod = f.testMethod ?? '';
		editErrorMessage = f.errorMessage ?? '';
		editStackTrace = f.stackTrace ?? '';
		editComment = f.comment ?? '';
		editFailureDialogOpen = true;
	}

	function openDeleteFailure(id: number) {
		deleteFailureId = id;
		deleteDialogOpen = true;
	}

	function statusColor(s: string): string {
		switch (s) {
			case 'PASS':
				return 'text-green-600 bg-green-50 dark:bg-green-950 dark:text-green-400';
			case 'FAIL':
				return 'text-red-600 bg-red-50 dark:bg-red-950 dark:text-red-400';
			case 'BLOCKED':
				return 'text-orange-600 bg-orange-50 dark:bg-orange-950 dark:text-orange-400';
			case 'SKIPPED':
				return 'text-gray-600 bg-gray-50 dark:bg-gray-800 dark:text-gray-400';
			default:
				return 'text-muted-foreground';
		}
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

	function priorityVariant(
		p: string
	): 'default' | 'secondary' | 'outline' | 'destructive' {
		switch (p) {
			case 'CRITICAL':
				return 'destructive';
			case 'HIGH':
				return 'default';
			case 'MEDIUM':
				return 'secondary';
			default:
				return 'outline';
		}
	}

	function handleResult() {
		return async ({
			result,
			update
		}: {
			result: { type: string; data?: Record<string, unknown> };
			update: () => Promise<void>;
		}) => {
			if (result.type === 'success') {
				selectedPending = new Set();
				await invalidateAll();
			} else if (result.type === 'failure') {
				toast.error((result.data?.error as string) ?? 'Operation failed');
				await update();
			}
		};
	}

	function handleFailResult() {
		return async ({
			result,
			update
		}: {
			result: { type: string; data?: Record<string, unknown> };
			update: () => Promise<void>;
		}) => {
			if (result.type === 'success') {
				failDialogOpen = false;
				toast.success(m.fail_marked());
				await invalidateAll();
			} else if (result.type === 'failure') {
				toast.error((result.data?.error as string) ?? 'Failed to save');
				await update();
			}
		};
	}

	function handleEditFailResult() {
		return async ({
			result,
			update
		}: {
			result: { type: string; data?: Record<string, unknown> };
			update: () => Promise<void>;
		}) => {
			if (result.type === 'success') {
				editFailureDialogOpen = false;
				toast.success(m.fail_updated());
				await invalidateAll();
			} else if (result.type === 'failure') {
				toast.error((result.data?.error as string) ?? 'Failed to update');
				await update();
			}
		};
	}

	function handleDeleteFailResult() {
		return async ({
			result,
			update
		}: {
			result: { type: string; data?: Record<string, unknown> };
			update: () => Promise<void>;
		}) => {
			if (result.type === 'success') {
				deleteDialogOpen = false;
				toast.success(m.fail_deleted());
				await invalidateAll();
			} else if (result.type === 'failure') {
				toast.error((result.data?.error as string) ?? 'Failed to delete');
				await update();
			}
		};
	}

	function openEditRun() {
		editRunName = run.name;
		editRunEnv = run.environment;
		editRunDialogOpen = true;
	}

	async function handleEditRun() {
		editRunSaving = true;
		try {
			const res = await fetch(`/api/projects/${data.project.id}/test-runs/${run.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: editRunName, environment: editRunEnv })
			});
			if (!res.ok) {
				const err = await res.json();
				toast.error(err.error ?? 'Failed to update');
				return;
			}
			editRunDialogOpen = false;
			toast.success(m.tr_updated());
			await invalidateAll();
		} finally {
			editRunSaving = false;
		}
	}

	function openCloneRun() {
		cloneRunName = `Copy of ${run.name}`;
		cloneDialogOpen = true;
	}

	async function handleCloneRun() {
		cloneRunSaving = true;
		try {
			const res = await fetch(`/api/projects/${data.project.id}/test-runs/${run.id}/clone`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: cloneRunName })
			});
			if (!res.ok) {
				toast.error('Failed to clone');
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

	async function handleDeleteRun() {
		deleteRunSaving = true;
		try {
			const res = await fetch(`/api/projects/${data.project.id}/test-runs/${run.id}`, {
				method: 'DELETE'
			});
			if (!res.ok) {
				toast.error('Failed to delete');
				return;
			}
			deleteRunDialogOpen = false;
			toast.success(m.tr_deleted());
			goto(basePath);
		} finally {
			deleteRunSaving = false;
		}
	}

	const environments = ['DEV', 'QA', 'STAGE', 'PROD'];
</script>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<div>
			<a href={basePath} class="text-muted-foreground hover:text-foreground text-sm"
				>&larr; {m.common_back_to({ target: m.tr_title() })}</a
			>
			<div class="mt-1 flex items-center gap-3">
				<h2 class="text-xl font-bold">{run.name}</h2>
				<Badge variant="outline">{run.environment}</Badge>
				<Badge variant={statusVariant(run.status)}>{run.status.replace('_', ' ')}</Badge>
				{#if sse.connected}
					<span class="flex items-center gap-1 text-xs text-green-600">
						<span class="inline-block h-2 w-2 animate-pulse rounded-full bg-green-500"></span>
						{m.sse_connected()}
					</span>
				{/if}
			</div>
		</div>
		<div class="flex gap-2">
			<Button
				variant="outline"
				size="sm"
				href="/api/projects/{data.project.id}/test-runs/{run.id}/export"
			>
				{m.run_export_csv()}
			</Button>
			{#if canExecute && run.status === 'CREATED'}
				<Button variant="outline" size="sm" onclick={openEditRun}>
					{m.tr_edit()}
				</Button>
			{/if}
			{#if canExecute}
				<Button variant="outline" size="sm" onclick={openCloneRun}>
					{m.tr_clone()}
				</Button>
			{/if}
			{#if isAdmin}
				<Button variant="outline" size="sm" class="text-destructive hover:text-destructive" onclick={() => (deleteRunDialogOpen = true)}>
					{m.tr_delete()}
				</Button>
			{/if}
			{#if canExecute && run.status !== 'COMPLETED'}
				{#if run.status === 'CREATED'}
					<form method="POST" action="?/updateRunStatus" use:enhance={handleResult}>
						<input type="hidden" name="status" value="IN_PROGRESS" />
						<Button type="submit" size="sm">{m.run_start()}</Button>
					</form>
				{/if}
				{#if run.status === 'IN_PROGRESS'}
					<form method="POST" action="?/updateRunStatus" use:enhance={handleResult}>
						<input type="hidden" name="status" value="COMPLETED" />
						<Button type="submit" variant="outline" size="sm">{m.run_complete()}</Button>
					</form>
				{/if}
			{/if}
		</div>
	</div>

	<!-- Progress Stats -->
	<Card.Root>
		<Card.Content class="pt-6">
			<div class="space-y-3">
				<div class="flex items-center justify-between text-sm">
					<span class="font-medium">{m.run_progress()}</span>
					<span class="text-muted-foreground">{m.run_pct_complete({ pct: completedPct })}</span>
				</div>
				<div class="bg-secondary flex h-3 overflow-hidden rounded-full">
					{#if stats.pass > 0}
						<div
							class="bg-green-500 transition-all"
							style="width: {(stats.pass / stats.total) * 100}%"
						></div>
					{/if}
					{#if stats.fail > 0}
						<div
							class="bg-red-500 transition-all"
							style="width: {(stats.fail / stats.total) * 100}%"
						></div>
					{/if}
					{#if stats.blocked > 0}
						<div
							class="bg-orange-500 transition-all"
							style="width: {(stats.blocked / stats.total) * 100}%"
						></div>
					{/if}
					{#if stats.skipped > 0}
						<div
							class="bg-gray-400 transition-all"
							style="width: {(stats.skipped / stats.total) * 100}%"
						></div>
					{/if}
				</div>
				<div class="flex flex-wrap gap-4 text-sm">
					<span class="flex items-center gap-1">
						<span class="inline-block h-3 w-3 rounded-full bg-green-500"></span>
						{m.dashboard_pass()}: {stats.pass}
					</span>
					<span class="flex items-center gap-1">
						<span class="inline-block h-3 w-3 rounded-full bg-red-500"></span>
						{m.dashboard_fail()}: {stats.fail}
					</span>
					<span class="flex items-center gap-1">
						<span class="inline-block h-3 w-3 rounded-full bg-orange-500"></span>
						{m.dashboard_blocked()}: {stats.blocked}
					</span>
					<span class="flex items-center gap-1">
						<span class="inline-block h-3 w-3 rounded-full bg-gray-400"></span>
						{m.dashboard_skipped()}: {stats.skipped}
					</span>
					<span class="flex items-center gap-1">
						<span class="bg-secondary inline-block h-3 w-3 rounded-full"></span>
						{m.dashboard_pending()}: {stats.pending}
					</span>
				</div>
			</div>
		</Card.Content>
	</Card.Root>

	<!-- Status Filter Tabs -->
	<div class="flex flex-wrap gap-1">
		{#each statusTabs as tab (tab.key)}
			<Button
				variant={statusFilter === tab.key ? 'default' : 'outline'}
				size="sm"
				class="h-7 px-3 text-xs"
				onclick={() => setStatusFilter(tab.key)}
			>
				{tab.label}
				<span class="ml-1 opacity-70">({tab.count})</span>
			</Button>
		{/each}
	</div>

	<!-- Bulk Actions -->
	{#if canExecute && selectedPending.size > 0}
		<div class="bg-muted flex items-center gap-3 rounded-lg p-3">
			<span class="text-sm font-medium">{m.run_pending_selected({ count: selectedPending.size })}</span>
			<form method="POST" action="?/bulkPass" use:enhance={handleResult}>
				{#each [...selectedPending] as id (id)}
					<input type="hidden" name="executionIds" value={id} />
				{/each}
				<Button type="submit" size="sm" variant="outline">{m.run_bulk_pass()}</Button>
			</form>
		</div>
	{/if}

	<!-- Executions Table -->
	<Card.Root>
		<Table.Root>
			<Table.Header>
				<Table.Row>
					{#if canExecute && pendingExecutions.length > 0}
						<Table.Head class="w-10">
							<input
								type="checkbox"
								checked={allPendingSelected}
								onchange={togglePendingAll}
								class="rounded"
							/>
						</Table.Head>
					{/if}
					<Table.Head class="w-28">{m.common_key()}</Table.Head>
					<Table.Head>{m.common_title()}</Table.Head>
					<Table.Head class="w-24">{m.common_priority()}</Table.Head>
					<Table.Head class="w-28">{m.common_status()}</Table.Head>
					{#if canExecute}
						<Table.Head class="w-52">{m.common_actions()}</Table.Head>
					{/if}
					<Table.Head class="w-32">{m.run_executed_by()}</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each data.executions as exec (exec.id)}
					{@const execFailures = getFailures(exec.id)}
					<Table.Row>
						{#if canExecute && pendingExecutions.length > 0}
							<Table.Cell>
								{#if exec.status === 'PENDING'}
									<input
										type="checkbox"
										checked={selectedPending.has(exec.id)}
										onchange={() => togglePending(exec.id)}
										class="rounded"
									/>
								{/if}
							</Table.Cell>
						{/if}
						<Table.Cell class="font-mono text-sm">{exec.testCaseKey}</Table.Cell>
						<Table.Cell class="font-medium">
							{exec.testCaseTitle}
							<span class="text-muted-foreground text-xs"> (v{exec.versionNo})</span>
						</Table.Cell>
						<Table.Cell>
							<Badge variant={priorityVariant(exec.testCasePriority)}>
								{exec.testCasePriority}
							</Badge>
						</Table.Cell>
						<Table.Cell>
							<button
								type="button"
								class="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium {statusColor(
									exec.status
								)}"
								onclick={() => {
									if (exec.status === 'FAIL') {
										viewFailuresExecId =
											viewFailuresExecId === exec.id ? null : exec.id;
									}
								}}
								class:cursor-pointer={exec.status === 'FAIL'}
								class:underline={exec.status === 'FAIL' && execFailures.length > 0}
							>
								{exec.status}
								{#if exec.status === 'FAIL' && execFailures.length > 0}
									({execFailures.length})
								{/if}
							</button>
						</Table.Cell>
						{#if canExecute}
							<Table.Cell>
								{#if exec.status === 'PENDING' || run.status !== 'COMPLETED'}
									<div class="flex gap-1">
										{#each ['PASS', 'BLOCKED', 'SKIPPED'] as s (s)}
											{#if exec.status !== s}
												<form
													method="POST"
													action="?/updateStatus"
													use:enhance={handleResult}
													class="inline"
												>
													<input type="hidden" name="executionId" value={exec.id} />
													<input type="hidden" name="status" value={s} />
													<Button
														type="submit"
														variant="ghost"
														size="sm"
														class="h-7 px-2 text-xs {s === 'PASS'
															? 'text-green-600 hover:text-green-700'
															: s === 'BLOCKED'
																? 'text-orange-600 hover:text-orange-700'
																: 'text-gray-600 hover:text-gray-700'}"
													>
														{s}
													</Button>
												</form>
											{/if}
										{/each}
										{#if exec.status !== 'FAIL'}
											<Button
												type="button"
												variant="ghost"
												size="sm"
												class="h-7 px-2 text-xs text-red-600 hover:text-red-700"
												onclick={() => openFailDialog(exec.id, exec.testCaseKey)}
											>
												FAIL
											</Button>
										{/if}
									</div>
								{/if}
							</Table.Cell>
						{/if}
						<Table.Cell class="text-muted-foreground text-sm">
							{exec.executedBy ?? '-'}
						</Table.Cell>
					</Table.Row>
					<!-- Inline failure details -->
					{#if exec.status === 'FAIL' && viewFailuresExecId === exec.id}
						<Table.Row>
							<Table.Cell
								colspan={canExecute ? (pendingExecutions.length > 0 ? 8 : 7) : (pendingExecutions.length > 0 ? 7 : 6)}
							>
								<div class="bg-red-50 dark:bg-red-950/30 space-y-3 rounded-md p-4">
									<div class="flex items-center justify-between">
										<h4 class="text-sm font-medium text-red-800 dark:text-red-300">
											{m.fail_details()}
										</h4>
										{#if canExecute}
											<Button
												type="button"
												variant="outline"
												size="sm"
												onclick={() => openFailDialog(exec.id, exec.testCaseKey)}
											>
												{m.fail_add_detail()}
											</Button>
										{/if}
									</div>
									<div class="mb-3 border-b pb-3">
										<AttachmentManager
											referenceType="EXECUTION"
											referenceId={exec.id}
											editable={canExecute}
										/>
									</div>
									{#if execFailures.length === 0}
										<p class="text-muted-foreground text-sm">
											{m.fail_no_details()}
										</p>
									{:else}
										{#each execFailures as f (f.id)}
											<div class="rounded border bg-white p-3 dark:bg-gray-900">
												<div class="flex items-start justify-between">
													<div class="space-y-1 text-sm">
														{#if f.errorMessage}
															<div>
																<span class="font-medium">{m.fail_error()}:</span>
																{f.errorMessage}
															</div>
														{/if}
														{#if f.testMethod}
															<div>
																<span class="font-medium">{m.fail_method()}:</span>
																{f.testMethod}
															</div>
														{/if}
														{#if f.failureEnvironment}
															<div>
																<span class="font-medium">{m.common_environment()}:</span>
																{f.failureEnvironment}
															</div>
														{/if}
														{#if f.stackTrace}
															<details class="mt-2">
																<summary
																	class="text-muted-foreground cursor-pointer text-xs"
																	>{m.fail_stack_trace()}</summary
																>
																<pre
																	class="bg-muted mt-1 overflow-x-auto rounded p-2 text-xs">{f.stackTrace}</pre>
															</details>
														{/if}
														{#if f.comment}
															<div class="text-muted-foreground mt-1">
																{f.comment}
															</div>
														{/if}
													</div>
													{#if canExecute}
														<div class="flex gap-1">
															<Button
																type="button"
																variant="ghost"
																size="sm"
																class="h-7 px-2 text-xs"
																onclick={() => openEditFailure(f)}
															>
																{m.common_edit()}
															</Button>
															<Button
																type="button"
																variant="ghost"
																size="sm"
																class="text-destructive hover:text-destructive h-7 px-2 text-xs"
																onclick={() => openDeleteFailure(f.id)}
															>
																{m.common_delete()}
															</Button>
														</div>
													{/if}
												</div>
												<div class="text-muted-foreground mt-2 text-xs">
													{f.createdBy} &middot; {new Date(f.createdAt).toLocaleString()}
												</div>
												<div class="mt-3 border-t pt-3">
													<AttachmentManager
														referenceType="FAILURE"
														referenceId={f.id}
														editable={canExecute}
													/>
												</div>
											</div>
										{/each}
									{/if}
								</div>
							</Table.Cell>
						</Table.Row>
					{/if}
				{/each}
			</Table.Body>
		</Table.Root>
	</Card.Root>

	<!-- Pagination -->
	{#if totalPages > 1}
		<div class="flex items-center justify-between">
			<span class="text-muted-foreground text-sm">
				{m.run_page_info({ page: currentPage, total: totalPages })}
			</span>
			<div class="flex gap-1">
				<Button
					variant="outline"
					size="sm"
					class="h-7 px-3 text-xs"
					disabled={currentPage <= 1}
					onclick={() => goToPage(currentPage - 1)}
				>
					{m.run_prev_page()}
				</Button>
				{#each Array.from({ length: totalPages }, (_, i) => i + 1) as p (p)}
					{#if p === 1 || p === totalPages || (p >= currentPage - 2 && p <= currentPage + 2)}
						<Button
							variant={p === currentPage ? 'default' : 'outline'}
							size="sm"
							class="h-7 w-7 px-0 text-xs"
							onclick={() => goToPage(p)}
						>
							{p}
						</Button>
					{:else if p === currentPage - 3 || p === currentPage + 3}
						<span class="text-muted-foreground flex h-7 items-center px-1 text-xs">...</span>
					{/if}
				{/each}
				<Button
					variant="outline"
					size="sm"
					class="h-7 px-3 text-xs"
					disabled={currentPage >= totalPages}
					onclick={() => goToPage(currentPage + 1)}
				>
					{m.run_next_page()}
				</Button>
			</div>
		</div>
	{/if}
</div>

<!-- FAIL with Detail Dialog -->
<Dialog.Root bind:open={failDialogOpen}>
	<Dialog.Portal>
		<Dialog.Overlay />
		<Dialog.Content class="sm:max-w-lg">
			<Dialog.Header>
				<Dialog.Title>{m.fail_mark_title({ key: failExecutionKey })}</Dialog.Title>
				<Dialog.Description>{m.fail_mark_desc()}</Dialog.Description>
			</Dialog.Header>
			<form method="POST" action="?/failWithDetail" use:enhance={handleFailResult}>
				<input type="hidden" name="executionId" value={failExecutionId} />
				<div class="space-y-4 py-4">
					<div class="space-y-2">
						<Label for="errorMessage">{m.fail_error_message()}</Label>
						<Textarea
							id="errorMessage"
							name="errorMessage"
							bind:value={errorMessage}
							placeholder={m.fail_error_placeholder()}
							rows={2}
						/>
					</div>
					<div class="grid gap-4 sm:grid-cols-2">
						<div class="space-y-2">
							<Label for="failureEnvironment">{m.common_environment()}</Label>
							<Input
								id="failureEnvironment"
								name="failureEnvironment"
								bind:value={failureEnvironment}
								placeholder={m.fail_env_placeholder()}
							/>
						</div>
						<div class="space-y-2">
							<Label for="testMethod">{m.fail_method_label()}</Label>
							<Input
								id="testMethod"
								name="testMethod"
								bind:value={testMethod}
								placeholder={m.fail_method_placeholder()}
							/>
						</div>
					</div>
					<div class="space-y-2">
						<Label for="stackTrace">{m.fail_stack_trace()}</Label>
						<Textarea
							id="stackTrace"
							name="stackTrace"
							bind:value={stackTrace}
							placeholder={m.fail_stack_placeholder()}
							rows={4}
							class="font-mono text-xs"
						/>
					</div>
					<div class="space-y-2">
						<Label for="failComment">{m.common_comment()}</Label>
						<Textarea
							id="failComment"
							name="comment"
							bind:value={failComment}
							placeholder={m.fail_comment_placeholder()}
							rows={2}
						/>
					</div>
				</div>
				<Dialog.Footer>
					<Button type="button" variant="outline" onclick={() => (failDialogOpen = false)}>
						{m.common_cancel()}
					</Button>
					<Button type="submit" variant="destructive">{m.fail_mark_submit()}</Button>
				</Dialog.Footer>
			</form>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<!-- Edit Failure Dialog -->
<Dialog.Root bind:open={editFailureDialogOpen}>
	<Dialog.Portal>
		<Dialog.Overlay />
		<Dialog.Content class="sm:max-w-lg">
			<Dialog.Header>
				<Dialog.Title>{m.fail_edit_title()}</Dialog.Title>
			</Dialog.Header>
			<form method="POST" action="?/updateFailure" use:enhance={handleEditFailResult}>
				<input type="hidden" name="failureId" value={editFailureId} />
				<div class="space-y-4 py-4">
					<div class="space-y-2">
						<Label for="editErrorMessage">{m.fail_error_message()}</Label>
						<Textarea
							id="editErrorMessage"
							name="errorMessage"
							bind:value={editErrorMessage}
							rows={2}
						/>
					</div>
					<div class="grid gap-4 sm:grid-cols-2">
						<div class="space-y-2">
							<Label for="editFailureEnvironment">{m.common_environment()}</Label>
							<Input
								id="editFailureEnvironment"
								name="failureEnvironment"
								bind:value={editFailureEnvironment}
							/>
						</div>
						<div class="space-y-2">
							<Label for="editTestMethod">{m.fail_method_label()}</Label>
							<Input
								id="editTestMethod"
								name="testMethod"
								bind:value={editTestMethod}
							/>
						</div>
					</div>
					<div class="space-y-2">
						<Label for="editStackTrace">{m.fail_stack_trace()}</Label>
						<Textarea
							id="editStackTrace"
							name="stackTrace"
							bind:value={editStackTrace}
							rows={4}
							class="font-mono text-xs"
						/>
					</div>
					<div class="space-y-2">
						<Label for="editComment">{m.common_comment()}</Label>
						<Textarea
							id="editComment"
							name="comment"
							bind:value={editComment}
							rows={2}
						/>
					</div>
				</div>
				<Dialog.Footer>
					<Button
						type="button"
						variant="outline"
						onclick={() => (editFailureDialogOpen = false)}
					>
						{m.common_cancel()}
					</Button>
					<Button type="submit">{m.common_save_changes()}</Button>
				</Dialog.Footer>
			</form>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<!-- Delete Failure Dialog -->
<AlertDialog.Root bind:open={deleteDialogOpen}>
	<AlertDialog.Portal>
		<AlertDialog.Overlay />
		<AlertDialog.Content>
			<AlertDialog.Header>
				<AlertDialog.Title>{m.fail_delete_title()}</AlertDialog.Title>
				<AlertDialog.Description>
					{m.fail_delete_confirm()}
				</AlertDialog.Description>
			</AlertDialog.Header>
			<AlertDialog.Footer>
				<AlertDialog.Cancel>{m.common_cancel()}</AlertDialog.Cancel>
				<form method="POST" action="?/deleteFailure" use:enhance={handleDeleteFailResult}>
					<input type="hidden" name="failureId" value={deleteFailureId} />
					<Button type="submit" variant="destructive">{m.common_delete()}</Button>
				</form>
			</AlertDialog.Footer>
		</AlertDialog.Content>
	</AlertDialog.Portal>
</AlertDialog.Root>

<!-- Edit Run Dialog -->
<Dialog.Root bind:open={editRunDialogOpen}>
	<Dialog.Portal>
		<Dialog.Overlay />
		<Dialog.Content class="sm:max-w-md">
			<Dialog.Header>
				<Dialog.Title>{m.tr_edit_title()}</Dialog.Title>
			</Dialog.Header>
			<div class="space-y-4 py-4">
				<div class="space-y-2">
					<Label for="editRunName">{m.tr_run_name()}</Label>
					<Input id="editRunName" bind:value={editRunName} />
				</div>
				<div class="space-y-2">
					<Label for="editRunEnv">{m.common_environment()}</Label>
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
				<Button variant="outline" onclick={() => (editRunDialogOpen = false)}>
					{m.common_cancel()}
				</Button>
				<Button onclick={handleEditRun} disabled={editRunSaving || !editRunName.trim()}>
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
					<Label for="cloneRunName">{m.tr_clone_name_label()}</Label>
					<Input id="cloneRunName" bind:value={cloneRunName} />
				</div>
			</div>
			<Dialog.Footer>
				<Button variant="outline" onclick={() => (cloneDialogOpen = false)}>
					{m.common_cancel()}
				</Button>
				<Button onclick={handleCloneRun} disabled={cloneRunSaving || !cloneRunName.trim()}>
					{cloneRunSaving ? m.common_creating() : m.tr_clone()}
				</Button>
			</Dialog.Footer>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<!-- Delete Run Dialog -->
<AlertDialog.Root bind:open={deleteRunDialogOpen}>
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
				<Button variant="destructive" onclick={handleDeleteRun} disabled={deleteRunSaving}>
					{deleteRunSaving ? m.common_saving() : m.common_delete()}
				</Button>
			</AlertDialog.Footer>
		</AlertDialog.Content>
	</AlertDialog.Portal>
</AlertDialog.Root>
