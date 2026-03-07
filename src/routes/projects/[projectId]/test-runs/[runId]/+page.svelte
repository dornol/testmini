<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { tick } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { createRunEventSource } from '$lib/sse.svelte';
	import * as m from '$lib/paraglide/messages.js';
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
		onresult={() => {}}
	/>

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
