<script lang="ts">
	import PageHeader from '$lib/components/patterns/PageHeader.svelte';
	import * as m from '$lib/paraglide/messages.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { apiPost, apiDelete, apiFetch } from '$lib/api-client';
	import { toast } from 'svelte-sonner';
	import ReportShareDialog from './ReportShareDialog.svelte';
	import ReportFilters from './ReportFilters.svelte';
	import ReportSummaryCards from './ReportSummaryCards.svelte';
	import ReportCharts from './ReportCharts.svelte';

	let { data } = $props();

	let shareDialogOpen = $state(false);

	// ── Schedule dialog state ──
	let scheduleDialogOpen = $state(false);
	let schedules = $state<
		Array<{
			id: number;
			name: string;
			cronExpression: string;
			recipientEmails: string[];
			reportRange: string;
			enabled: boolean;
			lastSentAt: string | null;
		}>
	>([]);
	let newScheduleName = $state('');
	let newScheduleCron = $state('0 9 * * 1');
	let newScheduleEmails = $state('');
	let newScheduleRange = $state('last_7_days');
	let scheduleLoading = $state(false);

	const projectId = $derived(data.project.id);
	const isAdmin = $derived(data.userRole === 'PROJECT_ADMIN');
	const canManageShare = $derived(isAdmin || data.userRole === 'QA' || data.userRole === 'ADMIN');
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

	async function openScheduleDialog() {
		scheduleDialogOpen = true;
		scheduleLoading = true;
		try {
			schedules = await apiFetch(`/api/projects/${projectId}/reports/schedules`);
		} catch {
			/* handled by apiFetch */
		}
		scheduleLoading = false;
	}

	async function createSchedule() {
		if (!newScheduleName.trim() || !newScheduleEmails.trim()) return;
		const emails = newScheduleEmails
			.split(',')
			.map((e) => e.trim())
			.filter(Boolean);
		try {
			await apiPost(`/api/projects/${projectId}/reports/schedules`, {
				name: newScheduleName.trim(),
				cronExpression: newScheduleCron,
				recipientEmails: emails,
				reportRange: newScheduleRange
			});
			toast.success(m.report_schedule_saved());
			newScheduleName = '';
			newScheduleEmails = '';
			newScheduleCron = '0 9 * * 1';
			newScheduleRange = 'last_7_days';
			schedules = await apiFetch(`/api/projects/${projectId}/reports/schedules`);
		} catch {
			/* handled by apiFetch */
		}
	}

	async function toggleSchedule(id: number, enabled: boolean) {
		try {
			await apiFetch(`/api/projects/${projectId}/reports/schedules/${id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ enabled })
			});
			schedules = schedules.map((s) => (s.id === id ? { ...s, enabled } : s));
		} catch {
			/* handled by apiFetch */
		}
	}

	async function deleteSchedule(id: number) {
		try {
			await apiDelete(`/api/projects/${projectId}/reports/schedules/${id}`);
			toast.success(m.report_schedule_deleted());
			schedules = schedules.filter((s) => s.id !== id);
		} catch {
			/* handled by apiFetch */
		}
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
		onOpenScheduleDialog={openScheduleDialog}
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
{/key}

<!-- Schedule Dialog -->
{#if isAdmin}
	<Dialog.Root bind:open={scheduleDialogOpen}>
		<Dialog.Content class="sm:max-w-lg">
			<Dialog.Header>
				<Dialog.Title>{m.report_schedule()}</Dialog.Title>
			</Dialog.Header>
			<div class="space-y-4">
				<!-- Create new schedule -->
				<div class="space-y-2 rounded-lg border p-3">
					<h4 class="text-sm font-medium">{m.report_schedule_create()}</h4>
					<input
						type="text"
						bind:value={newScheduleName}
						placeholder={m.report_schedule_name()}
						class="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
					/>
					<div class="flex flex-col gap-2 sm:flex-row">
						<select
							bind:value={newScheduleCron}
							class="border-input bg-background w-full rounded-md border px-2 py-1 text-sm sm:w-auto"
						>
							<option value="0 9 * * 1">{m.report_schedule_weekly()}</option>
							<option value="0 9 1 * *">{m.report_schedule_monthly()}</option>
						</select>
						<select
							bind:value={newScheduleRange}
							class="border-input bg-background w-full rounded-md border px-2 py-1 text-sm sm:w-auto"
						>
							<option value="last_7_days">{m.filter_last_7_days()}</option>
							<option value="last_30_days">{m.filter_last_30_days()}</option>
							<option value="all">{m.filter_all_time()}</option>
						</select>
					</div>
					<input
						type="text"
						bind:value={newScheduleEmails}
						placeholder={m.report_schedule_recipients() + ' ' + m.common_comma_separated()}
						class="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
					/>
					<Button
						size="sm"
						class="w-full sm:w-auto"
						onclick={createSchedule}
						disabled={!newScheduleName.trim() || !newScheduleEmails.trim()}
					>
						{m.report_schedule_create()}
					</Button>
				</div>

				<!-- Existing schedules -->
				{#if scheduleLoading}
					<p class="text-muted-foreground text-sm">{m.common_loading()}</p>
				{:else if schedules.length === 0}
					<p class="text-muted-foreground text-sm">{m.report_schedule_empty()}</p>
				{:else}
					<div class="divide-y">
						{#each schedules as sched (sched.id)}
							<div
								class="flex min-w-0 flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between"
							>
								<div class="min-w-0">
									<p class="break-words text-sm font-medium">{sched.name}</p>
									<p class="break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">
										{sched.cronExpression} &middot; {m.common_recipients({
											count: sched.recipientEmails.length
										})}
										{#if sched.lastSentAt}
											&middot; {m.report_schedule_last_sent()}: {new Date(
												sched.lastSentAt
											).toLocaleDateString()}
										{/if}
									</p>
								</div>
								<div class="flex items-center gap-2 sm:gap-1">
									<input
										type="checkbox"
										checked={sched.enabled}
										onchange={() => toggleSchedule(sched.id, !sched.enabled)}
										class="h-4 w-4"
									/>
									<Button
										size="sm"
										variant="destructive"
										class="h-8 flex-1 text-xs sm:h-7 sm:flex-none"
										onclick={() => deleteSchedule(sched.id)}
									>
										{m.common_delete()}
									</Button>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</Dialog.Content>
	</Dialog.Root>
{/if}
