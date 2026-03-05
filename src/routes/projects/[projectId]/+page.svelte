<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import Chart from '$lib/components/Chart.svelte';
	import LazyChart from '$lib/components/LazyChart.svelte';
	import type { ChartConfiguration } from 'chart.js';

	let { data } = $props();
	const proj = $derived(data.project);
	const stats = $derived(data.stats);
	const recentRuns = $derived(data.recentRuns);
	const trendRuns = $derived(data.trendRuns);
	const activityLog = $derived(data.activityLog);

	const passRate = $derived(
		stats.execCounts.total > 0
			? Math.round((stats.execCounts.pass / stats.execCounts.total) * 100)
			: 0
	);

	const executed = $derived(stats.execCounts.total - stats.execCounts.pending);

	const trendConfig = $derived<ChartConfiguration>({
		type: 'line',
		data: {
			labels: trendRuns.map((r) => r.name.length > 10 ? r.name.slice(0, 10) + '..' : r.name),
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

	function statusColor(s: string): string {
		switch (s) {
			case 'PASS':
				return 'text-green-600';
			case 'FAIL':
				return 'text-red-600';
			case 'BLOCKED':
				return 'text-orange-600';
			case 'SKIPPED':
				return 'text-gray-500';
			default:
				return 'text-muted-foreground';
		}
	}

	function timeAgo(date: Date | string): string {
		const d = typeof date === 'string' ? new Date(date) : date;
		const now = new Date();
		const diffMs = now.getTime() - d.getTime();
		const diffMin = Math.floor(diffMs / 60000);
		if (diffMin < 1) return 'just now';
		if (diffMin < 60) return `${diffMin}m ago`;
		const diffHr = Math.floor(diffMin / 60);
		if (diffHr < 24) return `${diffHr}h ago`;
		const diffDay = Math.floor(diffHr / 24);
		return `${diffDay}d ago`;
	}
</script>

<!-- Summary Cards -->
<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
	<Card.Root>
		<Card.Header class="pb-2">
			<Card.Title class="text-muted-foreground text-sm font-medium">{m.dashboard_test_cases()}</Card.Title>
		</Card.Header>
		<Card.Content>
			<p class="text-2xl font-bold">{stats.testCaseCount}</p>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header class="pb-2">
			<Card.Title class="text-muted-foreground text-sm font-medium">{m.dashboard_test_runs()}</Card.Title>
		</Card.Header>
		<Card.Content>
			<p class="text-2xl font-bold">{stats.runCounts.total}</p>
			<div class="text-muted-foreground mt-1 flex gap-2 text-xs">
				{#if stats.runCounts.inProgress > 0}
					<span class="text-blue-600">{m.dashboard_in_progress({ count: stats.runCounts.inProgress })}</span>
				{/if}
				{#if stats.runCounts.completed > 0}
					<span class="text-green-600">{m.dashboard_completed({ count: stats.runCounts.completed })}</span>
				{/if}
			</div>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header class="pb-2">
			<Card.Title class="text-muted-foreground text-sm font-medium">{m.dashboard_pass_rate()}</Card.Title>
		</Card.Header>
		<Card.Content>
			<p class="text-2xl font-bold {passRate >= 80 ? 'text-green-600' : passRate >= 50 ? 'text-yellow-600' : stats.execCounts.total === 0 ? '' : 'text-red-600'}">
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
			<Card.Title class="text-muted-foreground text-sm font-medium">{m.dashboard_members()}</Card.Title>
		</Card.Header>
		<Card.Content>
			<p class="text-2xl font-bold">{proj.memberCount}</p>
			<p class="text-muted-foreground mt-1 text-xs">
				{proj.active ? m.common_active() : m.common_inactive()} &middot; {new Date(proj.createdAt).toLocaleDateString()}
			</p>
		</Card.Content>
	</Card.Root>
</div>

<!-- Execution Breakdown -->
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

<!-- Charts Row -->
{#if stats.execCounts.total > 0 || trendRuns.length > 0}
	<div class="mt-4 grid gap-4 lg:grid-cols-2">
		<!-- Pass Rate Trend -->
		{#if trendRuns.length > 0}
			<Card.Root>
				<Card.Header>
					<Card.Title class="text-sm font-medium">{m.dashboard_pass_rate_trend()}</Card.Title>
				</Card.Header>
				<Card.Content>
					<Chart config={trendConfig} aria-label="Pass rate trend chart" />
				</Card.Content>
			</Card.Root>
		{/if}

		<!-- Execution Status Doughnut -->
		{#if stats.execCounts.total > 0}
			<Card.Root>
				<Card.Header>
					<Card.Title class="text-sm font-medium">{m.dashboard_exec_chart()}</Card.Title>
				</Card.Header>
				<Card.Content class="flex justify-center">
					<div class="w-64">
						<LazyChart config={doughnutConfig} aria-label="Execution status distribution chart" height="h-64" />
					</div>
				</Card.Content>
			</Card.Root>
		{/if}
	</div>
{/if}

<!-- Activity Log -->
{#if activityLog.length > 0}
	<Card.Root class="mt-4">
		<Card.Header>
			<Card.Title class="text-sm font-medium">{m.dashboard_activity()}</Card.Title>
		</Card.Header>
		<Card.Content>
			<div class="space-y-2">
				{#each activityLog as activity (activity.id)}
					<div class="flex items-center gap-3 text-sm">
						<span class="inline-block h-2 w-2 rounded-full {activity.status === 'PASS' ? 'bg-green-500' : activity.status === 'FAIL' ? 'bg-red-500' : activity.status === 'BLOCKED' ? 'bg-orange-500' : 'bg-gray-400'}"></span>
						<span class="font-medium {statusColor(activity.status)}">{activity.status}</span>
						<span class="text-muted-foreground">
							{activity.executedBy ?? '?'} &middot; {activity.testRunName}
						</span>
						<span class="text-muted-foreground ml-auto text-xs">
							{activity.executedAt ? timeAgo(activity.executedAt) : ''}
						</span>
					</div>
				{/each}
			</div>
		</Card.Content>
	</Card.Root>
{/if}

<!-- Recent Test Runs -->
{#if recentRuns.length > 0}
	<Card.Root class="mt-4">
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
		<Card.Content class="p-0">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>{m.common_name()}</Table.Head>
						<Table.Head class="w-24">{m.dashboard_env()}</Table.Head>
						<Table.Head class="w-28">{m.common_status()}</Table.Head>
						<Table.Head class="w-40">{m.dashboard_result()}</Table.Head>
						<Table.Head class="w-28">{m.common_date()}</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each recentRuns as run (run.id)}
						{@const runPassRate = run.totalCount > 0 ? Math.round((run.passCount / run.totalCount) * 100) : 0}
						<Table.Row
							class="cursor-pointer"
							onclick={() => { window.location.href = `/projects/${proj.id}/test-runs/${run.id}`; }}
						>
							<Table.Cell class="font-medium">{run.name}</Table.Cell>
							<Table.Cell>
								<Badge variant="outline">{run.environment}</Badge>
							</Table.Cell>
							<Table.Cell>
								<Badge variant={statusVariant(run.status)}>
									{run.status.replace('_', ' ')}
								</Badge>
							</Table.Cell>
							<Table.Cell>
								<div class="flex items-center gap-2">
									<div class="bg-secondary flex h-2 w-20 overflow-hidden rounded-full" title="{m.dashboard_pass()}: {run.passCount}, {m.dashboard_fail()}: {run.failCount}">
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
									<span class="text-muted-foreground text-xs">{runPassRate}% ({run.passCount}P / {run.failCount}F)</span>
								</div>
							</Table.Cell>
							<Table.Cell class="text-muted-foreground text-xs">
								{new Date(run.createdAt).toLocaleDateString()}
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</Card.Content>
	</Card.Root>
{/if}

<!-- Description -->
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
