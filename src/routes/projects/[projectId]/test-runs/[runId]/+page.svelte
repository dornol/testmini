<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { tick } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { createRunEventSource } from '$lib/sse.svelte';
	import * as m from '$lib/paraglide/messages.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { apiFetch } from '$lib/api-client';
	import RunHeader from './components/RunHeader.svelte';
	import ExecutionFilters from './components/ExecutionFilters.svelte';
	import ExecutionTable from './components/ExecutionTable.svelte';
	import BulkActionBar from './components/BulkActionBar.svelte';
	import FailureDetailDialog from './components/FailureDetailDialog.svelte';

	let { data } = $props();

	// Extract stable IDs for SSE (project/run IDs are fixed for the lifetime of this page)
	const projectId = $derived(data.project.id);
	const runId = $derived(data.run.id);

	// SSE real-time sync — created once since IDs are route params and never change
	const sse = $derived(createRunEventSource(projectId, runId));
	let debounceTimer: ReturnType<typeof setTimeout> | undefined;
	let scrollContainer: HTMLDivElement | undefined;

	$effect(() => {
		sse.connect();
		return () => sse.disconnect();
	});

	$effect(() => {
		const event = sse.lastEvent;
		if (!event) return;

		clearTimeout(debounceTimer);
		debounceTimer = setTimeout(async () => {
			const savedScroll = scrollContainer?.scrollTop ?? 0;
			await invalidateAll();
			await tick();
			if (scrollContainer) scrollContainer.scrollTop = savedScroll;
		}, 300);
	});

	// Selection state for bulk operations
	let selectedPending = new SvelteSet<number>();

	// Failure dialog state
	let failDialogOpen = $state(false);
	let failExecutionId = $state<number | null>(null);
	let failExecutionKey = $state('');

	// Edit failure dialog state
	let editFailureDialogOpen = $state(false);
	let editFailureRecord = $state<(typeof data.failures)[0] | null>(null);

	// Delete failure dialog state
	let deleteDialogOpen = $state(false);
	let deleteFailureId = $state<number | null>(null);

	const run = $derived(data.run);
	const stats = $derived(data.stats);
	const canExecute = $derived(data.userRole !== 'VIEWER');
	const isAdmin = $derived(data.userRole === 'PROJECT_ADMIN' || data.userRole === 'ADMIN');
	const basePath = $derived(`/projects/${projectId}/test-runs`);

	const completedPct = $derived(
		stats.total > 0 ? Math.round(((stats.total - stats.pending) / stats.total) * 100) : 0
	);

	const statusFilter = $derived(data.statusFilter);

	const statusTabs = $derived([
		{ key: '', label: m.run_status_filter_all(), count: stats.total },
		{ key: 'PENDING', label: m.dashboard_pending(), count: stats.pending },
		{ key: 'PASS', label: m.dashboard_pass(), count: stats.pass },
		{ key: 'FAIL', label: m.dashboard_fail(), count: stats.fail },
		{ key: 'BLOCKED', label: m.dashboard_blocked(), count: stats.blocked },
		{ key: 'SKIPPED', label: m.dashboard_skipped(), count: stats.skipped }
	]);

	const pendingExecutions = $derived(data.executions.filter((e) => e.status === 'PENDING'));

	const allPendingSelected = $derived(
		pendingExecutions.length > 0 && pendingExecutions.every((e) => selectedPending.has(e.id))
	);

	function togglePendingAll() {
		if (allPendingSelected) {
			selectedPending.clear();
		} else {
			selectedPending.clear();
			for (const e of pendingExecutions) {
				selectedPending.add(e.id);
			}
		}
	}

	function togglePending(id: number) {
		if (selectedPending.has(id)) {
			selectedPending.delete(id);
		} else {
			selectedPending.add(id);
		}
	}

	function openFailDialog(execId: number, key: string) {
		failExecutionId = execId;
		failExecutionKey = key;
		failDialogOpen = true;
	}

	function openEditFailure(f: (typeof data.failures)[0]) {
		editFailureRecord = f;
		editFailureDialogOpen = true;
	}

	function openDeleteFailure(id: number) {
		deleteFailureId = id;
		deleteDialogOpen = true;
	}

	async function handleMutationSuccess() {
		selectedPending.clear();
		const savedScroll = scrollContainer?.scrollTop ?? 0;
		await invalidateAll();
		await tick();
		if (scrollContainer) scrollContainer.scrollTop = savedScroll;
	}

	// Duration formatting
	function formatDuration(ms: number): string {
		if (ms < 1000) return `${ms}ms`;
		if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
		const mins = Math.floor(ms / 60000);
		const secs = Math.round((ms % 60000) / 1000);
		return `${mins}m ${secs}s`;
	}

	const durationSummary = $derived(data.durationSummary);

	// Comparison dialog
	let comparisonDialogOpen = $state(false);
	let comparisonData = $state<{
		summary: { total: number; improved: number; regressed: number; unchanged: number };
		comparisons: Array<{ testCaseKey: string; title: string; priority: string; originalStatus: string; retestStatus: string; improved: boolean }>;
	} | null>(null);
	let comparisonLoading = $state(false);

	async function openComparison() {
		comparisonDialogOpen = true;
		comparisonLoading = true;
		try {
			comparisonData = await apiFetch(`/api/projects/${projectId}/test-runs/${runId}/comparison`);
		} catch {
			comparisonData = null;
		}
		comparisonLoading = false;
	}

	function statusColor(s: string): string {
		switch (s) {
			case 'PASS': return 'text-green-600';
			case 'FAIL': return 'text-red-600';
			case 'BLOCKED': return 'text-orange-600';
			case 'SKIPPED': return 'text-gray-500';
			default: return 'text-muted-foreground';
		}
	}
</script>

<div class="space-y-6">
	<RunHeader
		{run}
		{stats}
		{projectId}
		{basePath}
		{canExecute}
		{isAdmin}
		sseConnected={sse.connected}
		{completedPct}
		projectEnvironments={data.projectEnvironments}
		onresult={() => {}}
	/>

	<!-- Duration Summary & Comparison -->
	{#if durationSummary.completedCount > 0 || run.retestOfRunId}
		<div class="flex flex-wrap gap-4">
			{#if durationSummary.completedCount > 0}
				<Card.Root class="flex-1">
					<Card.Header class="pb-2">
						<Card.Title class="text-sm font-medium">{m.duration_summary()}</Card.Title>
					</Card.Header>
					<Card.Content>
						<div class="flex flex-wrap gap-6 text-sm">
							<div>
								<span class="text-muted-foreground">{m.duration_total()}:</span>
								<span class="ml-1 font-medium">{formatDuration(durationSummary.totalDuration)}</span>
							</div>
							<div>
								<span class="text-muted-foreground">{m.duration_avg()}:</span>
								<span class="ml-1 font-medium">{formatDuration(durationSummary.avgDuration)}</span>
							</div>
							<div>
								<span class="text-muted-foreground">{m.duration_min()}:</span>
								<span class="ml-1 font-medium">{formatDuration(durationSummary.minDuration)}</span>
							</div>
							<div>
								<span class="text-muted-foreground">{m.duration_max()}:</span>
								<span class="ml-1 font-medium">{formatDuration(durationSummary.maxDuration)}</span>
							</div>
							<div class="text-muted-foreground">
								{m.duration_completed({ count: durationSummary.completedCount })}
							</div>
						</div>
					</Card.Content>
				</Card.Root>
			{/if}
			{#if run.retestOfRunId}
				<Card.Root class="flex-shrink-0">
					<Card.Content class="flex h-full items-center pt-6">
						<Button variant="outline" size="sm" onclick={openComparison}>
							{m.comparison_title()}
						</Button>
					</Card.Content>
				</Card.Root>
			{/if}
		</div>
	{/if}

	<ExecutionFilters
		{statusTabs}
		{statusFilter}
		executionCount={data.executions.length}
	/>

	{#if canExecute && selectedPending.size > 0}
		<BulkActionBar {selectedPending} onresult={handleMutationSuccess} />
	{/if}

	<ExecutionTable
		executions={data.executions}
		failures={data.failures}
		{canExecute}
		projectPriorities={data.projectPriorities}
		{selectedPending}
		{allPendingSelected}
		{pendingExecutions}
		{projectId}
		{runId}
		currentUserId={data.currentUserId}
		userRole={data.userRole}
		onTogglePendingAll={togglePendingAll}
		onTogglePending={togglePending}
		onOpenFailDialog={openFailDialog}
		onOpenEditFailure={openEditFailure}
		onOpenDeleteFailure={openDeleteFailure}
		onScrollContainerBind={(el) => {
			scrollContainer = el;
		}}
	/>
</div>

<!-- Comparison Dialog -->
<Dialog.Root bind:open={comparisonDialogOpen}>
	<Dialog.Portal>
		<Dialog.Overlay />
		<Dialog.Content class="max-w-3xl max-h-[80vh] overflow-y-auto">
			<Dialog.Header>
				<Dialog.Title>{m.comparison_title()}</Dialog.Title>
			</Dialog.Header>
			{#if comparisonLoading}
				<p class="text-muted-foreground py-4 text-sm">Loading...</p>
			{:else if comparisonData}
				<div class="space-y-4 py-2">
					<div class="flex gap-4 text-sm">
						<Badge variant="default" class="bg-green-600">{m.comparison_improved()}: {comparisonData.summary.improved}</Badge>
						<Badge variant="destructive">{m.comparison_regressed()}: {comparisonData.summary.regressed}</Badge>
						<Badge variant="secondary">{m.comparison_unchanged()}: {comparisonData.summary.unchanged}</Badge>
					</div>
					<Table.Root>
						<Table.Header>
							<Table.Row>
								<Table.Head>{m.reports_test_case()}</Table.Head>
								<Table.Head class="w-28">{m.comparison_original()}</Table.Head>
								<Table.Head class="w-28">{m.comparison_retest()}</Table.Head>
								<Table.Head class="w-24"></Table.Head>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each comparisonData.comparisons as c (c.testCaseKey)}
								{@const regressed = c.originalStatus === 'PASS' && (c.retestStatus === 'FAIL' || c.retestStatus === 'BLOCKED')}
								<Table.Row>
									<Table.Cell>
										<span class="text-muted-foreground text-xs">{c.testCaseKey}</span>
										<span class="ml-1">{c.title}</span>
									</Table.Cell>
									<Table.Cell>
										<span class="font-medium {statusColor(c.originalStatus)}">{c.originalStatus}</span>
									</Table.Cell>
									<Table.Cell>
										<span class="font-medium {statusColor(c.retestStatus)}">{c.retestStatus}</span>
									</Table.Cell>
									<Table.Cell>
										{#if c.improved}
											<Badge variant="default" class="bg-green-600 text-xs">{m.comparison_improved()}</Badge>
										{:else if regressed}
											<Badge variant="destructive" class="text-xs">{m.comparison_regressed()}</Badge>
										{/if}
									</Table.Cell>
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
				</div>
			{:else}
				<p class="text-muted-foreground py-4 text-sm">{m.error_operation_failed()}</p>
			{/if}
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<FailureDetailDialog
	{failDialogOpen}
	{failExecutionId}
	{failExecutionKey}
	{editFailureDialogOpen}
	{editFailureRecord}
	{deleteDialogOpen}
	{deleteFailureId}
	onfailDialogOpenChange={(open) => {
		failDialogOpen = open;
	}}
	oneditFailureDialogOpenChange={(open) => {
		editFailureDialogOpen = open;
	}}
	ondeleteDialogOpenChange={(open) => {
		deleteDialogOpen = open;
	}}
	onsuccess={handleMutationSuccess}
/>
