<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { goto } from '$app/navigation';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import Chart from '$lib/components/Chart.svelte';
	import LazyChart from '$lib/components/LazyChart.svelte';
	import type { ChartConfiguration } from 'chart.js';
	import { untrack } from 'svelte';
	import { DEFAULT_LAYOUT, SIZE_COLS } from '$lib/dashboard-widgets';
	import { statusColorText } from '$lib/execution-status';
	import type { WidgetConfig } from '$lib/server/db/schema';
	import DashboardCustomizer from './DashboardCustomizer.svelte';

	let { data } = $props();
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

	// ── Layout state ──────────────────────────────────────
	// Read data.initialLayout once via untrack() so the $state initializer does not
	// register a reactive dependency on `data`.  After this point, `layout` is owned
	// entirely by local state and is never re-derived from props.
	let layout = $state<WidgetConfig[]>(
		untrack(() => (data.initialLayout ?? DEFAULT_LAYOUT).slice().sort((a, b) => a.order - b.order))
	);

	// Sorted visible widgets for the main grid
	const visibleWidgets = $derived(
		layout
			.slice()
			.sort((a, b) => a.order - b.order)
			.filter((w) => w.visible)
	);

	// ── Chart configs ─────────────────────────────────────
	const passRate = $derived(
		stats.execCounts.total > 0
			? Math.round((stats.execCounts.pass / stats.execCounts.total) * 100)
			: 0
	);

	const executed = $derived(stats.execCounts.total - stats.execCounts.pending);

	const trendConfig = $derived<ChartConfiguration>({
		type: 'line',
		data: {
			labels: trendRuns.map((r) => (r.name.length > 10 ? r.name.slice(0, 10) + '..' : r.name)),
			datasets: [
				{
					label: m.dashboard_pass_rate(),
					data: trendRuns.map((r) =>
						r.totalCount > 0 ? Math.round((r.passCount / r.totalCount) * 100) : 0
					),
					borderColor: '#22c55e',
					backgroundColor: 'rgba(34, 197, 94, 0.1)',
					fill: true,
					tension: 0.3
				}
			]
		},
		options: {
			responsive: true,
			plugins: { legend: { display: false } },
			scales: {
				y: { min: 0, max: 100, ticks: { callback: (v) => v + '%' } }
			}
		}
	});

	const doughnutConfig = $derived<ChartConfiguration>({
		type: 'doughnut',
		data: {
			labels: [
				m.dashboard_pass(),
				m.dashboard_fail(),
				m.dashboard_blocked(),
				m.dashboard_skipped(),
				m.dashboard_pending()
			],
			datasets: [
				{
					data: [
						stats.execCounts.pass,
						stats.execCounts.fail,
						stats.execCounts.blocked,
						stats.execCounts.skipped,
						stats.execCounts.pending
					],
					backgroundColor: ['#22c55e', '#ef4444', '#f97316', '#9ca3af', '#e5e7eb']
				}
			]
		},
		options: {
			responsive: true,
			plugins: {
				legend: { position: 'bottom' }
			}
		}
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

<DashboardCustomizer projectId={proj.id} bind:layout />

<!-- ── Widget Grid ─────────────────────────────────────── -->
<div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
	{#each visibleWidgets as widget (widget.id)}
		<div class="{SIZE_COLS[widget.size]} min-w-0">
			<!-- stats_summary -->
			{#if widget.id === 'stats_summary'}
				<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
							<div class="text-muted-foreground mt-1 flex gap-2 text-xs">
								{#if stats.runCounts.inProgress > 0}
									<span class="text-blue-600"
										>{m.dashboard_in_progress({ count: stats.runCounts.inProgress })}</span
									>
								{/if}
								{#if stats.runCounts.completed > 0}
									<span class="text-green-600"
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
							<p
								class="text-2xl font-bold {passRate >= 80
									? 'text-green-600'
									: passRate >= 50
										? 'text-yellow-600'
										: stats.execCounts.total === 0
											? ''
											: 'text-red-600'}"
							>
								{stats.execCounts.total > 0 ? `${passRate}%` : '-'}
							</p>
							{#if stats.execCounts.total > 0}
								<p class="text-muted-foreground mt-1 text-xs">
									{m.dashboard_executed({ pass: stats.execCounts.pass, executed })}
								</p>
							{/if}
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
								{proj.active ? m.common_active() : m.common_inactive()} &middot; {new Date(
									proj.createdAt
								).toLocaleDateString()}
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
						<Card.Title class="text-sm font-medium">{m.dashboard_pass_rate_trend()}</Card.Title>
					</Card.Header>
					<Card.Content>
						{#if trendRuns.length > 0}
							<Chart config={trendConfig} aria-label={m.dashboard_pass_rate_chart_aria()} />
						{:else}
							<p class="text-muted-foreground text-sm text-center py-8">
								{m.dashboard_no_chart_data()}
							</p>
						{/if}
					</Card.Content>
				</Card.Root>

				<!-- status_distribution -->
			{:else if widget.id === 'status_distribution'}
				<Card.Root class="h-full">
					<Card.Header>
						<Card.Title class="text-sm font-medium">{m.dashboard_exec_chart()}</Card.Title>
					</Card.Header>
					<Card.Content class="flex justify-center">
						{#if stats.execCounts.total > 0}
							<div class="w-64">
								<LazyChart
									config={doughnutConfig}
									aria-label={m.dashboard_status_chart_aria()}
									height="h-64"
								/>
							</div>
						{:else}
							<p class="text-muted-foreground text-sm text-center py-8">
								{m.dashboard_no_chart_data()}
							</p>
						{/if}
					</Card.Content>
				</Card.Root>

				<!-- recent_runs -->
			{:else if widget.id === 'recent_runs'}
				{#if recentRuns.length > 0}
					<Card.Root class="h-full">
						<Card.Header>
							<div class="flex items-center justify-between">
								<Card.Title class="text-sm font-medium">{m.dashboard_recent_runs()}</Card.Title>
								<a
									href="/projects/{proj.id}/test-runs"
									class="text-muted-foreground hover:text-foreground text-xs"
								>
									{m.dashboard_view_all()} &rarr;
								</a>
							</div>
						</Card.Header>
						<Card.Content class="overflow-x-auto p-0">
							<Table.Root class="min-w-[360px] table-fixed">
								<Table.Header>
									<Table.Row>
										<Table.Head>{m.common_name()}</Table.Head>
										<Table.Head class="w-24 hidden sm:table-cell">{m.dashboard_env()}</Table.Head>
										<Table.Head class="w-28">{m.common_status()}</Table.Head>
										<Table.Head class="w-40 hidden md:table-cell">{m.dashboard_result()}</Table.Head
										>
										<Table.Head class="w-28 hidden lg:table-cell">{m.common_date()}</Table.Head>
									</Table.Row>
								</Table.Header>
								<Table.Body>
									{#each recentRuns as run (run.id)}
										{@const runPassRate =
											run.totalCount > 0 ? Math.round((run.passCount / run.totalCount) * 100) : 0}
										<Table.Row
											class="cursor-pointer"
											onclick={() => goto(`/projects/${proj.id}/test-runs/${run.id}`)}
										>
											<Table.Cell class="min-w-0 font-medium">
												<div class="truncate" title={run.name}>{run.name}</div>
											</Table.Cell>
											<Table.Cell class="hidden sm:table-cell">
												<Badge variant="outline">{run.environment}</Badge>
											</Table.Cell>
											<Table.Cell>
												<Badge variant={statusVariant(run.status)}>
													{run.status.replace('_', ' ')}
												</Badge>
											</Table.Cell>
											<Table.Cell class="hidden md:table-cell">
												<div class="flex items-center gap-2">
													<div
														class="bg-secondary flex h-2 w-20 overflow-hidden rounded-full"
														title="{m.dashboard_pass()}: {run.passCount}, {m.dashboard_fail()}: {run.failCount}"
													>
														{#if run.passCount > 0}
															<div
																class="bg-green-500"
																style="width: {(run.passCount / run.totalCount) * 100}%"
															></div>
														{/if}
														{#if run.failCount > 0}
															<div
																class="bg-red-500"
																style="width: {(run.failCount / run.totalCount) * 100}%"
															></div>
														{/if}
													</div>
													<span class="text-muted-foreground text-xs"
														>{runPassRate}% ({run.passCount}P / {run.failCount}F)</span
													>
												</div>
											</Table.Cell>
											<Table.Cell class="text-muted-foreground text-xs hidden lg:table-cell">
												{new Date(run.createdAt).toLocaleDateString()}
											</Table.Cell>
										</Table.Row>
									{/each}
								</Table.Body>
							</Table.Root>
						</Card.Content>
					</Card.Root>
				{:else}
					<Card.Root class="h-full">
						<Card.Header>
							<Card.Title class="text-sm font-medium">{m.dashboard_recent_runs()}</Card.Title>
						</Card.Header>
						<Card.Content>
							<p class="text-muted-foreground text-sm text-center py-8">
								{m.dashboard_no_chart_data()}
							</p>
						</Card.Content>
					</Card.Root>
				{/if}

				<!-- priority_breakdown -->
			{:else if widget.id === 'priority_breakdown'}
				<Card.Root class="h-full">
					<Card.Header>
						<Card.Title class="text-sm font-medium">{m.dashboard_priority_breakdown()}</Card.Title>
					</Card.Header>
					<Card.Content>
						<div class="space-y-2 text-sm">
							{#each [['CRITICAL', 'bg-red-500'], ['HIGH', 'bg-orange-500'], ['MEDIUM', 'bg-yellow-500'], ['LOW', 'bg-blue-400']] as const as [label, color] (label)}
								<div class="flex items-center gap-2">
									<span class="inline-block h-2.5 w-2.5 shrink-0 rounded-full {color}"></span>
									<span class="text-muted-foreground flex-1">{label}</span>
								</div>
							{/each}
							<p class="text-muted-foreground pt-1 text-xs">
								{m.dashboard_priority_hint()}
							</p>
						</div>
					</Card.Content>
				</Card.Root>

				<!-- top_failing -->
			{:else if widget.id === 'top_failing'}
				<Card.Root class="h-full">
					<Card.Header>
						<Card.Title class="text-sm font-medium">{m.dashboard_top_failing()}</Card.Title>
					</Card.Header>
					<Card.Content>
						{#if activityLog.filter((a) => a.status === 'FAIL').length > 0}
							<ul class="space-y-1.5 text-sm">
								{#each activityLog
									.filter((a) => a.status === 'FAIL')
									.slice(0, 5) as activity (activity.id)}
									<li class="flex items-center gap-2">
										<span class="inline-block h-2 w-2 shrink-0 rounded-full bg-red-500"></span>
										<span class="text-muted-foreground min-w-0 flex-1 truncate">
											{activity.testRunName}
										</span>
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
			<p class="text-muted-foreground whitespace-pre-wrap">{proj.description}</p>
		</Card.Content>
	</Card.Root>
{/if}

<!-- Activity log (always shown below grid, not a customizable widget) -->
{#if activityLog.length > 0}
	<Card.Root class="mt-4">
		<Card.Header>
			<Card.Title class="text-sm font-medium">{m.dashboard_activity()}</Card.Title>
		</Card.Header>
		<Card.Content>
			<div class="space-y-2">
				{#each visibleActivities as activity (activity.id)}
					<div class="flex min-w-0 items-start gap-3 text-sm">
						<span
							class="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full {activity.status === 'PASS'
								? 'bg-green-500'
								: activity.status === 'FAIL'
									? 'bg-red-500'
									: activity.status === 'BLOCKED'
										? 'bg-orange-500'
										: 'bg-gray-400'}"
						></span>
						<span class="shrink-0 font-medium {statusColorText(activity.status)}"
							>{activity.status}</span
						>
						<span
							class="text-muted-foreground min-w-0 flex-1 truncate"
							title="{activity.executedBy ?? '?'} · {activity.testRunName}"
						>
							{activity.executedBy ?? '?'} &middot; {activity.testRunName}
						</span>
						<span class="text-muted-foreground shrink-0 text-xs">
							{activity.executedAt ? timeAgo(activity.executedAt) : ''}
						</span>
					</div>
				{/each}
			</div>
			{#if activityLog.length > ACTIVITY_LIMIT && !showAllActivity}
				<button
					type="button"
					class="mt-3 w-full text-center text-xs text-primary hover:underline"
					onclick={() => {
						showAllActivity = true;
					}}
				>
					{m.dashboard_activity_show_more()} ({activityLog.length - ACTIVITY_LIMIT})
				</button>
			{/if}
		</Card.Content>
	</Card.Root>
{/if}
