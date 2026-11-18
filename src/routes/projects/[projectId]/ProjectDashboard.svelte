<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import PageHeader from '$lib/components/patterns/PageHeader.svelte';
	import EmptyState from '$lib/components/patterns/EmptyState.svelte';
	import { Button } from '$lib/components/ui/button';
	import { getLocale } from '$lib/paraglide/runtime.js';
	import '$lib/components/reports/report-results.css';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import Chart from '$lib/components/Chart.svelte';
	import LazyChart from '$lib/components/LazyChart.svelte';
	import type { ChartConfiguration } from 'chart.js';
	import { untrack } from 'svelte';
	import { mode } from 'mode-watcher';
	import { SIZE_COLS } from '$lib/dashboard-widgets';
	import { statusColorText } from '$lib/execution-status';
	import type { WidgetConfig } from '$lib/server/db/schema';
	import DashboardCustomizer from './DashboardCustomizer.svelte';

	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
	const proj = $derived(data.project);
	const stats = $derived(data.stats);
	const recentRuns = $derived(data.recentRuns);
	const trendRuns = $derived(data.trendRuns);
	const activityLog = $derived(data.activityLog);
	const ACTIVITY_LIMIT = 20;
	let showAllActivity = $state(false);
	const visibleActivities = $derived(
		showAllActivity ? activityLog : activityLog.slice(0, ACTIVITY_LIMIT)
	);

	let layout = $state<WidgetConfig[]>(untrack(() => data.initialLayout));

	// Sorted visible widgets for the main grid
	const visibleWidgets = $derived(
		layout
			.slice()
			.sort((a, b) => a.order - b.order)
			.filter((w) => w.visible)
	);

	// ── Chart configs ─────────────────────────────────────
	const executed = $derived(stats.execCounts.total - stats.execCounts.pending);
	const passRate = $derived(percentPassed(stats.execCounts.pass, executed));
	const runsPath = $derived(`/projects/${proj.id}/test-runs`);
	const casesPath = $derived(`/projects/${proj.id}/test-cases`);
	const canCreate = $derived(data.userRole !== 'VIEWER');

	function percentPassed(pass: number, executedCount: number) {
		return executedCount > 0 ? Math.round((pass / executedCount) * 100) : null;
	}

	function formatDate(date: Date | string) {
		return new Date(date).toLocaleDateString(getLocale(), { dateStyle: 'medium' });
	}
	const resultLabels = $derived([
		m.dashboard_env(),
		m.common_status(),
		m.dashboard_result(),
		m.common_date()
	]);

	const chartText = $derived(mode.current === 'dark' ? '#cbd5e1' : '#475569');
	const trendColor = $derived(mode.current === 'dark' ? '#4ade80' : '#15803d');
	const outcomes = $derived([
		{ label: m.dashboard_pass(), count: stats.execCounts.pass, light: '#15803d', dark: '#4ade80' },
		{ label: m.dashboard_fail(), count: stats.execCounts.fail, light: '#b91c1c', dark: '#f87171' },
		{
			label: m.dashboard_blocked(),
			count: stats.execCounts.blocked,
			light: '#b45309',
			dark: '#fbbf24'
		},
		{
			label: m.dashboard_skipped(),
			count: stats.execCounts.skipped,
			light: '#475569',
			dark: '#94a3b8'
		},
		{
			label: m.dashboard_pending(),
			count: stats.execCounts.pending,
			light: '#a1a1aa',
			dark: '#71717a'
		}
	]);
	const trendConfig = $derived<ChartConfiguration>({
		type: 'line',
		data: {
			labels: trendRuns.map((run) => run.name),
			datasets: [
				{
					label: m.dashboard_pass_rate(),
					data: trendRuns.map((run) => percentPassed(run.passCount, run.executedCount)),
					borderColor: trendColor,
					backgroundColor: 'rgba(34, 197, 94, 0.1)',
					fill: true,
					tension: 0.3
				}
			]
		},
		options: {
			responsive: true,
			animation: false,
			plugins: { legend: { display: false } },
			scales: {
				x: {
					grid: { display: false },
					ticks: {
						color: chartText,
						maxRotation: 0,
						callback(value) {
							const label = this.getLabelForValue(Number(value));
							return label.length > 14 ? label.slice(0, 14) + '…' : label;
						}
					}
				},
				y: {
					min: 0,
					max: 100,
					grid: { color: mode.current === 'dark' ? '#334155' : '#e2e8f0' },
					ticks: { color: chartText, callback: (value) => value + '%' }
				}
			}
		}
	});

	const doughnutConfig = $derived<ChartConfiguration>({
		type: 'doughnut',
		data: {
			labels: outcomes.map(({ label }) => label),
			datasets: [
				{
					data: outcomes.map(({ count }) => count),
					backgroundColor: outcomes.map(({ light, dark }) =>
						mode.current === 'dark' ? dark : light
					),
					borderWidth: 0
				}
			]
		},
		options: {
			responsive: true,
			animation: false,
			plugins: {
				legend: { position: 'bottom', labels: { color: chartText } }
			}
		}
	});

	const executionLabels = $derived<Record<string, string>>({
		PASS: m.dashboard_pass(),
		FAIL: m.dashboard_fail(),
		BLOCKED: m.dashboard_blocked(),
		SKIPPED: m.dashboard_skipped(),
		PENDING: m.dashboard_pending()
	});

	const runLabels = $derived<Record<string, string>>({
		CREATED: m.common_created(),
		IN_PROGRESS: m.dashboard_status_in_progress(),
		COMPLETED: m.dashboard_status_completed()
	});

	// ── Helpers ───────────────────────────────────────────
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

	function timeAgo(date: Date | string): string {
		const d = typeof date === 'string' ? new Date(date) : date;
		const now = new Date();
		const diffMs = now.getTime() - d.getTime();
		const diffMin = Math.floor(diffMs / 60000);
		if (diffMin < 1) return m.dashboard_time_just_now();
		if (diffMin < 60) return m.dashboard_time_minutes_ago({ count: diffMin });
		const diffHr = Math.floor(diffMin / 60);
		if (diffHr < 24) return m.dashboard_time_hours_ago({ count: diffHr });
		const diffDay = Math.floor(diffHr / 24);
		return m.dashboard_time_days_ago({ count: diffDay });
	}
</script>

{#snippet activityLink(id: number, name: string)}
	<a
		href={runsPath + '/' + id}
		class="min-w-0 rounded-sm text-foreground underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [overflow-wrap:anywhere]"
	>
		{name}
	</a>
{/snippet}

{#snippet chartSummary(title: string)}
	<summary
		class="cursor-pointer rounded-md px-3 py-2 text-sm font-medium hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
	>
		{m.reports_chart_data()}<span class="sr-only"> · {title}</span>
	</summary>
{/snippet}

{#snippet mobileLabel(label: string)}
	<span aria-hidden="true" class="block text-xs text-muted-foreground sm:hidden">{label}</span>
{/snippet}

{#snippet runResult(label: string, value: string)}
	<Table.Cell role="cell" class="whitespace-normal">
		{@render mobileLabel(label)}
		{value}
	</Table.Cell>
{/snippet}

<div class="mb-4 space-y-3">
	<PageHeader title={m.nav_dashboard()} />
	{#if !stats.runCounts.total}
		<EmptyState
			title={stats.testCaseCount ? m.tr_empty_title() : m.tc_empty_title()}
			description={canCreate
				? stats.testCaseCount
					? m.tr_empty_create()
					: m.tc_empty_create()
				: m.dashboard_wait_for_runs()}
		>
			{#snippet actions()}
				{#if canCreate}
					{#if stats.testCaseCount}
						<Button href={runsPath + '/new'}>{m.tr_create()}</Button>
					{:else}
						<Button href={casesPath + '/new'}>{m.tc_create()}</Button>
					{/if}
				{:else}
					<Button variant="outline" href={casesPath}>{m.nav_test_cases()}</Button>
				{/if}
			{/snippet}
		</EmptyState>
	{/if}
</div>
<DashboardCustomizer projectId={proj.id} bind:layout />

{#if !visibleWidgets.length}
	<p class="mb-4 rounded-lg border bg-card p-4 text-sm text-muted-foreground">
		{m.dashboard_widgets_hidden()}
	</p>
{/if}

<!-- ── Widget Grid ─────────────────────────────────────── -->
<div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
	{#each visibleWidgets as widget (widget.id)}
		<div class="{SIZE_COLS[widget.size]} min-w-0">
			<!-- stats_summary -->
			{#if widget.id === 'stats_summary'}
				<div class="grid grid-cols-2 gap-3 xl:grid-cols-4">
					<Card.Root>
						<Card.Header class="pb-2">
							<Card.Title class="text-muted-foreground text-sm font-medium"
								>{m.dashboard_test_cases()}</Card.Title
							>
						</Card.Header>
						<Card.Content>
							<p class="text-2xl font-bold">{stats.testCaseCount}</p>
						</Card.Content>
					</Card.Root>

					<Card.Root>
						<Card.Header class="pb-2">
							<Card.Title class="text-muted-foreground text-sm font-medium"
								>{m.dashboard_test_runs()}</Card.Title
							>
						</Card.Header>
						<Card.Content>
							<p class="text-2xl font-bold">{stats.runCounts.total}</p>
							<div class="text-muted-foreground mt-1 flex flex-wrap gap-2 text-xs">
								{#if stats.runCounts.inProgress > 0}
									<span class="text-muted-foreground"
										>{m.dashboard_in_progress({ count: stats.runCounts.inProgress })}</span
									>
								{/if}
								{#if stats.runCounts.completed > 0}
									<span class="report-result-pass"
										>{m.dashboard_completed({ count: stats.runCounts.completed })}</span
									>
								{/if}
							</div>
						</Card.Content>
					</Card.Root>

					<Card.Root>
						<Card.Header class="pb-2">
							<Card.Title class="text-muted-foreground text-sm font-medium"
								>{m.dashboard_pass_rate()}</Card.Title
							>
						</Card.Header>
						<Card.Content>
							<p data-testid="dashboard-pass-rate" class="text-2xl font-bold tabular-nums">
								{passRate === null ? '—' : `${passRate}%`}
							</p>
							<p class="mt-1 text-xs text-muted-foreground">
								{passRate === null
									? m.dashboard_no_executed()
									: m.dashboard_executed({ pass: stats.execCounts.pass, executed })}
							</p>
						</Card.Content>
					</Card.Root>

					<Card.Root>
						<Card.Header class="pb-2">
							<Card.Title class="text-muted-foreground text-sm font-medium"
								>{m.dashboard_members()}</Card.Title
							>
						</Card.Header>
						<Card.Content>
							<p class="text-2xl font-bold">{proj.memberCount}</p>
							<p class="text-muted-foreground mt-1 text-xs">
								{proj.active ? m.common_active() : m.common_inactive()} · {formatDate(
									proj.createdAt
								)}
							</p>
						</Card.Content>
					</Card.Root>
				</div>

				<!-- Execution breakdown bar inside stats_summary -->
				{#if stats.execCounts.total > 0}
					<Card.Root class="mt-4">
						<Card.Header>
							<Card.Title class="text-sm font-medium">{m.dashboard_exec_summary()}</Card.Title>
						</Card.Header>
						<Card.Content>
							<div class="space-y-2">
								<div class="bg-secondary flex h-3 overflow-hidden rounded-full">
									{#if stats.execCounts.pass > 0}
										<div
											class="bg-green-500 transition-all"
											style="width: {(stats.execCounts.pass / stats.execCounts.total) * 100}%"
										></div>
									{/if}
									{#if stats.execCounts.fail > 0}
										<div
											class="bg-red-500 transition-all"
											style="width: {(stats.execCounts.fail / stats.execCounts.total) * 100}%"
										></div>
									{/if}
									{#if stats.execCounts.blocked > 0}
										<div
											class="bg-orange-500 transition-all"
											style="width: {(stats.execCounts.blocked / stats.execCounts.total) * 100}%"
										></div>
									{/if}
									{#if stats.execCounts.skipped > 0}
										<div
											class="bg-gray-400 transition-all"
											style="width: {(stats.execCounts.skipped / stats.execCounts.total) * 100}%"
										></div>
									{/if}
								</div>
								<div class="flex flex-wrap gap-4 text-sm">
									<span class="flex items-center gap-1">
										<span class="inline-block h-3 w-3 rounded-full bg-green-500"></span>
										{m.dashboard_pass()}: {stats.execCounts.pass}
									</span>
									<span class="flex items-center gap-1">
										<span class="inline-block h-3 w-3 rounded-full bg-red-500"></span>
										{m.dashboard_fail()}: {stats.execCounts.fail}
									</span>
									<span class="flex items-center gap-1">
										<span class="inline-block h-3 w-3 rounded-full bg-orange-500"></span>
										{m.dashboard_blocked()}: {stats.execCounts.blocked}
									</span>
									<span class="flex items-center gap-1">
										<span class="inline-block h-3 w-3 rounded-full bg-gray-400"></span>
										{m.dashboard_skipped()}: {stats.execCounts.skipped}
									</span>
									<span class="flex items-center gap-1">
										<span class="bg-secondary inline-block h-3 w-3 rounded-full border"></span>
										{m.dashboard_pending()}: {stats.execCounts.pending}
									</span>
								</div>
							</div>
						</Card.Content>
					</Card.Root>
				{/if}

				<!-- pass_rate_trend -->
			{:else if widget.id === 'pass_rate_trend'}
				<Card.Root class="h-full">
					<Card.Header>
						<h3 id="dashboard-trend-heading" class="text-lg font-medium">
							{m.dashboard_pass_rate_trend()}
						</h3>
					</Card.Header>
					<Card.Content class="min-w-0 space-y-3">
						{#if trendRuns.length > 0}
							<Chart config={trendConfig} aria-label={m.dashboard_pass_rate_chart_aria()} />
							<details class="rounded-md border">
								{@render chartSummary(m.dashboard_pass_rate_trend())}
								<div class="p-2">
									<Table.Root
										role="table"
										aria-labelledby="dashboard-trend-heading"
										class="report-metrics"
									>
										<Table.Header role="rowgroup">
											<Table.Row role="row">
												{#each [m.tr_run_name(), m.dashboard_pass_rate(), m.reports_executions()] as label (label)}
													<Table.Head scope="col" role="columnheader">{label}</Table.Head>
												{/each}
											</Table.Row>
										</Table.Header>
										<Table.Body role="rowgroup">
											{#each trendRuns as run (run.id)}
												{@const rate = percentPassed(run.passCount, run.executedCount)}
												<Table.Row role="row">
													<Table.Head
														scope="row"
														role="rowheader"
														class="report-metric-wide h-auto whitespace-normal py-2 text-foreground"
													>
														{@render activityLink(run.id, run.name)}
													</Table.Head>
													{@render runResult(
														m.dashboard_pass_rate(),
														rate === null ? '—' : `${rate}%`
													)}
													{@render runResult(
														m.reports_executions(),
														m.dashboard_executed({
															pass: run.passCount,
															executed: run.executedCount
														})
													)}
												</Table.Row>
											{/each}
										</Table.Body>
									</Table.Root>
								</div>
							</details>
						{:else}
							<p class="py-8 text-center text-sm text-muted-foreground">
								{m.dashboard_no_chart_data()}
							</p>
						{/if}
					</Card.Content>
				</Card.Root>

				<!-- status_distribution -->
			{:else if widget.id === 'status_distribution'}
				<Card.Root class="h-full">
					<Card.Header>
						<h3 id="dashboard-status-heading" class="text-lg font-medium">
							{m.dashboard_exec_chart()}
						</h3>
					</Card.Header>
					<Card.Content class="min-w-0 space-y-3">
						{#if stats.execCounts.total > 0}
							<LazyChart
								config={doughnutConfig}
								aria-label={m.dashboard_status_chart_aria()}
								height="h-64"
								class="mx-auto w-full max-w-64"
							/>
							<details class="rounded-md border">
								{@render chartSummary(m.dashboard_exec_chart())}
								<dl
									aria-labelledby="dashboard-status-heading"
									class="grid grid-cols-2 gap-3 p-3 text-sm sm:grid-cols-3"
								>
									{#each outcomes as { label, count } (label)}
										<div>
											<dt class="text-muted-foreground">{label}</dt>
											<dd class="font-medium tabular-nums">{count}</dd>
										</div>
									{/each}
								</dl>
							</details>
						{:else}
							<p class="py-8 text-center text-sm text-muted-foreground">
								{m.dashboard_no_chart_data()}
							</p>
						{/if}
					</Card.Content>
				</Card.Root>

				<!-- recent_runs -->
			{:else if widget.id === 'recent_runs'}
				<Card.Root class="h-full">
					<Card.Header>
						<div class="flex flex-wrap items-center justify-between gap-2">
							<h3 id="dashboard-recent-runs" class="text-lg font-medium">
								{m.dashboard_recent_runs()}
							</h3>
							<Button href={runsPath} variant="outline" size="sm">{m.dashboard_view_all()}</Button>
						</div>
					</Card.Header>
					{#if recentRuns.length}
						<Card.Content class="p-0">
							<Table.Root
								role="table"
								aria-labelledby="dashboard-recent-runs"
								class="report-metrics sm:min-w-[34rem]"
							>
								<Table.Header role="rowgroup">
									<Table.Row role="row">
										<Table.Head scope="col" role="columnheader">{m.common_name()}</Table.Head>
										{#each resultLabels as label (label)}
											<Table.Head scope="col" role="columnheader">{label}</Table.Head>
										{/each}
									</Table.Row>
								</Table.Header>
								<Table.Body role="rowgroup">
									{#each recentRuns as run (run.id)}
										{@const runRate = percentPassed(run.passCount, run.executedCount)}
										<Table.Row role="row">
											<Table.Head
												scope="row"
												role="rowheader"
												class="report-metric-wide h-auto max-w-72 whitespace-normal py-2 text-foreground"
											>
												<a
													href={runsPath + '/' + run.id}
													class="inline-block rounded-sm font-medium hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
												>
													{run.name}
												</a>
											</Table.Head>
											{@render runResult(resultLabels[0], run.environment)}
											<Table.Cell role="cell">
												{@render mobileLabel(resultLabels[1])}
												<Badge variant={statusVariant(run.status)}
													>{runLabels[run.status] ?? run.status}</Badge
												>
											</Table.Cell>
											{@render runResult(
												resultLabels[2],
												runRate === null
													? m.dashboard_no_executed()
													: `${runRate}% · ${m.shared_pass_fail({ pass: run.passCount, fail: run.failCount })}`
											)}
											{@render runResult(resultLabels[3], formatDate(run.createdAt))}
										</Table.Row>
									{/each}
								</Table.Body>
							</Table.Root>
						</Card.Content>
					{:else}
						<Card.Content>
							<p class="text-sm text-muted-foreground">{m.tr_empty_title()}</p>
						</Card.Content>
					{/if}
				</Card.Root>

				<!-- priority_breakdown -->
			{:else if widget.id === 'priority_breakdown'}
				<Card.Root class="h-full">
					<Card.Header>
						<h3 id="dashboard-priorities" class="text-lg font-medium">
							{m.dashboard_priority_breakdown()}
						</h3>
					</Card.Header>
					<Card.Content>
						{#if data.priorityCounts.length}
							<dl class="divide-y text-sm" aria-labelledby="dashboard-priorities">
								{#each data.priorityCounts as priority (priority.priority)}
									<div class="flex items-start justify-between gap-3 py-2">
										<dt class="min-w-0 [overflow-wrap:anywhere]">{priority.priority}</dt>
										<dd class="font-medium tabular-nums">{priority.count}</dd>
									</div>
								{/each}
							</dl>
						{:else}
							<p class="text-sm text-muted-foreground">{m.tc_empty_title()}</p>
						{/if}
					</Card.Content>
				</Card.Root>

				<!-- top_failing -->
			{:else if widget.id === 'top_failing'}
				<Card.Root class="h-full">
					<Card.Header>
						<h3 id="dashboard-recent-failures" class="text-lg font-medium">
							{m.dashboard_top_failing()}
						</h3>
					</Card.Header>
					<Card.Content>
						{#if activityLog.filter((a) => a.status === 'FAIL').length > 0}
							<ul class="space-y-1.5 text-sm" aria-labelledby="dashboard-recent-failures">
								{#each activityLog
									.filter((a) => a.status === 'FAIL')
									.slice(0, 5) as activity (activity.id)}
									<li class="flex flex-wrap items-baseline justify-between gap-x-2 py-1">
										{@render activityLink(activity.runId, activity.testRunName)}
										<span class="text-muted-foreground shrink-0 text-xs">
											{activity.executedAt ? timeAgo(activity.executedAt) : ''}
										</span>
									</li>
								{/each}
							</ul>
						{:else}
							<p class="text-muted-foreground text-sm">{m.dashboard_no_recent_failures()}</p>
						{/if}
					</Card.Content>
				</Card.Root>
			{/if}
		</div>
	{/each}
</div>

<!-- ── Description (always shown) ────────────────────── -->
{#if proj.description}
	<Card.Root class="mt-4">
		<Card.Header>
			<Card.Title class="text-sm font-medium">{m.common_description()}</Card.Title>
		</Card.Header>
		<Card.Content>
			<p class="text-muted-foreground whitespace-pre-wrap [overflow-wrap:anywhere]">
				{proj.description}
			</p>
		</Card.Content>
	</Card.Root>
{/if}

<!-- Activity log (always shown below grid) -->
{#if activityLog.length}
	<Card.Root class="mt-4">
		<Card.Header>
			<h3 id="dashboard-activity" class="text-lg font-medium">{m.dashboard_activity()}</h3>
		</Card.Header>
		<Card.Content>
			<ul class="divide-y" aria-labelledby="dashboard-activity">
				{#each visibleActivities as activity (activity.id)}
					<li class="min-w-0 space-y-1 py-2 text-sm">
						<div class="flex flex-wrap items-baseline justify-between gap-x-3">
							<span class="font-medium {statusColorText(activity.status)}">
								{executionLabels[activity.status] ?? activity.status}
							</span>
							{#if activity.executedAt}
								<time
									datetime={new Date(activity.executedAt).toISOString()}
									class="text-xs text-muted-foreground"
								>
									{timeAgo(activity.executedAt)}
								</time>
							{/if}
						</div>
						{@render activityLink(activity.runId, activity.testRunName)}
						{#if activity.executedBy}
							<p class="text-xs text-muted-foreground [overflow-wrap:anywhere]">
								{activity.executedBy}
							</p>
						{/if}
					</li>
				{/each}
			</ul>
			{#if activityLog.length > ACTIVITY_LIMIT && !showAllActivity}
				<Button variant="outline" class="mt-3" onclick={() => (showAllActivity = true)}>
					{m.dashboard_activity_show_more()} ({activityLog.length - ACTIVITY_LIMIT})
				</Button>
			{/if}
		</Card.Content>
	</Card.Root>
{/if}
