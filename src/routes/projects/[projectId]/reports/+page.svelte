<script lang="ts">
	import PageHeader from '$lib/components/patterns/PageHeader.svelte';
	import * as m from '$lib/paraglide/messages.js';
	import ReportScheduleDialog from './ReportScheduleDialog.svelte';
	import ReportShareDialog from './ReportShareDialog.svelte';
	import ReportFilters from './ReportFilters.svelte';
	import ReportSummaryCards from './ReportSummaryCards.svelte';
	import ReportCharts from './ReportCharts.svelte';

	let { data } = $props();

	let shareDialogOpen = $state(false);

	let scheduleDialogOpen = $state(false);

	const projectId = $derived(data.project.id);
	const isAdmin = $derived(data.userRole === 'PROJECT_ADMIN' || data.userRole === 'ADMIN');
	const canManageShare = $derived(isAdmin || data.userRole === 'QA');
	const shareConfig = $derived(
		data.dateRange.allTime
			? { preset: 'all_time' as const }
			: { from: data.dateRange.from ?? undefined, to: data.dateRange.to ?? undefined }
	);

	function getPdfUrl(): string {
		const params = new URLSearchParams();
		if (data.dateRange.allTime) {
			params.set('preset', 'all');
		} else {
			if (data.dateRange.from) params.set('from', data.dateRange.from);
			if (data.dateRange.to) params.set('to', data.dateRange.to);
		}
		return `/api/projects/${projectId}/reports/pdf?${params.toString()}`;
	}
</script>

<div class="space-y-4">
	<PageHeader title={m.nav_reports()} />
	<!-- Date Range Filter -->
	<ReportFilters
		dateRange={data.dateRange}
		invalidRange={data.invalidRange}
		{isAdmin}
		onExportPdf={() => window.open(getPdfUrl(), '_blank')}
		onOpenShareDialog={() => (shareDialogOpen = true)}
		onOpenScheduleDialog={() => (scheduleDialogOpen = true)}
	/>

	<!-- Environment Breakdown -->
	<ReportSummaryCards envStats={data.envStats} />

	<!-- Charts, Tables, and Stats -->
	<ReportCharts
		{projectId}
		recentRuns={data.recentRuns}
		dailyResults={data.dailyResults}
		priorityStats={data.priorityStats}
		creatorStats={data.creatorStats}
		assigneeStats={data.assigneeStats}
		executorStats={data.executorStats}
		topFailingCases={data.topFailingCases}
		flakyTests={data.flakyTests}
		staleTests={data.staleTests}
		slowestTests={data.slowestTests}
		defectDensity={data.defectDensity}
		projectPriorities={data.projectPriorities}
	/>
</div>

{#key projectId}
	<ReportShareDialog
		bind:open={shareDialogOpen}
		endpoint={`/api/projects/${projectId}/reports/share`}
		config={shareConfig}
		canManage={canManageShare}
	/>
	{#if isAdmin}
		<ReportScheduleDialog
			bind:open={scheduleDialogOpen}
			timeZone={data.scheduleTimeZone}
			endpoint={`/api/projects/${projectId}/reports/schedules`}
		/>
	{/if}
{/key}
