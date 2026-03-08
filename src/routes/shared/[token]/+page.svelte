<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import Chart from '$lib/components/Chart.svelte';
	import type { ChartConfiguration } from 'chart.js';

	let { data } = $props();

	const envStats = $derived(data.envStats);
	const recentRuns = $derived(data.recentRuns);
	const priorityStats = $derived(data.priorityStats);
	const dailyResults = $derived(data.dailyResults);
	const topFailingCases = $derived(data.topFailingCases);
	const dateRange = $derived(data.dateRange);

	function formatDisplayDate(iso: string | null): string {
		if (!iso) return '';
		return new Date(iso).toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	const activeDateLabel = $derived(
		dateRange.allTime
			? 'All time'
			: dateRange.from && dateRange.to
				? `${formatDisplayDate(dateRange.from)} – ${formatDisplayDate(dateRange.to)}`
				: 'Last 30 days'
	);

	function passRate(pass: number, total: number): string {
		if (total === 0) return '-';
		return `${Math.round((pass / total) * 100)}%`;
	}

	function barWidth(value: number, total: number): string {
		if (total === 0) return '0%';
		return `${(value / total) * 100}%`;
	}

	const trendBarConfig = $derived<ChartConfiguration>({
		type: 'bar',
		data: {
			labels: recentRuns.map((r) =>
				r.name.length > 10 ? r.name.slice(0, 10) + '..' : r.name
			),
			datasets: [
				{
					label: 'Pass',
					data: recentRuns.map((r) => r.passCount),
					backgroundColor: '#22c55e'
				},
				{
					label: 'Fail',
					data: recentRuns.map((r) => r.failCount),
					backgroundColor: '#ef4444'
				},
				{
					label: 'Blocked',
					data: recentRuns.map((r) => r.blockedCount),
					backgroundColor: '#f97316'
				},
				{
					label: 'Skipped',
					data: recentRuns.map((r) => r.skippedCount),
					backgroundColor: '#9ca3af'
				}
			]
		},
		options: {
			responsive: true,
			plugins: { legend: { position: 'bottom' } },
			scales: {
				x: { stacked: true },
				y: { stacked: true, beginAtZero: true }
			}
		}
	});

	const dailyBarConfig = $derived<ChartConfiguration>({
		type: 'bar',
		data: {
			labels: dailyResults.map((d) => d.date),
			datasets: [
				{
					label: 'Pass',
					data: dailyResults.map((d) => d.passCount),
					backgroundColor: '#22c55e'
				},
				{
					label: 'Fail',
					data: dailyResults.map((d) => d.failCount),
					backgroundColor: '#ef4444'
				},
				{
					label: 'Blocked',
					data: dailyResults.map((d) => d.blockedCount),
					backgroundColor: '#f97316'
				},
				{
					label: 'Skipped',
					data: dailyResults.map((d) => d.skippedCount),
					backgroundColor: '#9ca3af'
				}
			]
		},
		options: {
			responsive: true,
			plugins: { legend: { position: 'bottom' } },
			scales: {
				x: { stacked: true },
				y: { stacked: true, beginAtZero: true }
			}
		}
	});
</script>

<div class="mx-auto max-w-6xl p-6 space-y-4">
	<!-- Header -->
	<div class="text-center space-y-1">
		<h1 class="text-2xl font-bold">{data.reportName}</h1>
		<p class="text-muted-foreground text-sm">
			{data.projectName} &middot; {activeDateLabel}
		</p>
	</div>

	<!-- Environment Breakdown -->
	{#if envStats.length > 0}
		<Card.Root>
			<Card.Header>
				<Card.Title class="text-sm font-medium">Environment Summary</Card.Title>
			</Card.Header>
			<Card.Content>
				<div class="grid gap-4 sm:grid-cols-2">
					{#each envStats as env (env.environment)}
						{@const rate = env.totalExecs > 0 ? Math.round((env.passCount / env.totalExecs) * 100) : 0}
						<div class="rounded-lg border p-4">
							<div class="flex items-center justify-between">
								<Badge variant="outline">{env.environment}</Badge>
								<span
									class="text-2xl font-bold {rate >= 80
										? 'text-green-600'
										: rate >= 50
											? 'text-yellow-600'
											: env.totalExecs === 0
												? ''
												: 'text-red-600'}"
								>
									{env.totalExecs > 0 ? `${rate}%` : '-'}
								</span>
							</div>
							<div class="mt-3 space-y-1">
								<div class="bg-secondary flex h-2 overflow-hidden rounded-full">
									{#if env.passCount > 0}
										<div
											class="bg-green-500"
											style="width: {barWidth(env.passCount, env.totalExecs)}"
										></div>
									{/if}
									{#if env.failCount > 0}
										<div
											class="bg-red-500"
											style="width: {barWidth(env.failCount, env.totalExecs)}"
										></div>
									{/if}
								</div>
								<div class="text-muted-foreground flex justify-between text-xs">
									<span>{env.totalRuns} runs</span>
									<span>{env.passCount} pass / {env.failCount} fail</span>
								</div>
							</div>
						</div>
					{/each}
				</div>
			</Card.Content>
		</Card.Root>
	{/if}

	<!-- Trend Chart -->
	{#if recentRuns.length > 0}
		<Card.Root>
			<Card.Header>
				<Card.Title class="text-sm font-medium">Pass Rate Trend</Card.Title>
			</Card.Header>
			<Card.Content>
				<Chart config={trendBarConfig} />
			</Card.Content>
		</Card.Root>
	{/if}

	<!-- Daily Results -->
	{#if dailyResults.length > 0}
		<Card.Root>
			<Card.Header>
				<Card.Title class="text-sm font-medium">Daily Test Results</Card.Title>
			</Card.Header>
			<Card.Content>
				<Chart config={dailyBarConfig} />
			</Card.Content>
		</Card.Root>
	{/if}

	<!-- Priority Breakdown -->
	{#if priorityStats.length > 0}
		<Card.Root>
			<Card.Header>
				<Card.Title class="text-sm font-medium">Priority Breakdown</Card.Title>
			</Card.Header>
			<Card.Content class="p-0">
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>Priority</Table.Head>
							<Table.Head class="w-28">Total</Table.Head>
							<Table.Head class="w-28">Pass</Table.Head>
							<Table.Head class="w-28">Fail</Table.Head>
							<Table.Head class="w-28">Pass Rate</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each priorityStats as ps (ps.priority)}
							<Table.Row>
								<Table.Cell>
									<Badge variant="outline">{ps.priority}</Badge>
								</Table.Cell>
								<Table.Cell>{ps.total}</Table.Cell>
								<Table.Cell class="text-green-600">{ps.passCount}</Table.Cell>
								<Table.Cell class="text-red-600">{ps.failCount}</Table.Cell>
								<Table.Cell class="font-medium"
									>{passRate(ps.passCount, ps.total)}</Table.Cell
								>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</Card.Content>
		</Card.Root>
	{/if}

	<!-- Top Failing Test Cases -->
	{#if topFailingCases.length > 0}
		<Card.Root>
			<Card.Header>
				<Card.Title class="text-sm font-medium">Top Failing Test Cases</Card.Title>
			</Card.Header>
			<Card.Content class="p-0">
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>Test Case</Table.Head>
							<Table.Head class="w-28">Total</Table.Head>
							<Table.Head class="w-28">Failures</Table.Head>
							<Table.Head class="w-28">Pass Rate</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each topFailingCases as tc (tc.testCaseId)}
							<Table.Row>
								<Table.Cell>
									<span class="text-muted-foreground text-xs">{tc.testCaseKey}</span>
									<span class="ml-1 font-medium">{tc.title}</span>
								</Table.Cell>
								<Table.Cell>{tc.totalExecs}</Table.Cell>
								<Table.Cell class="text-red-600 font-medium">{tc.failCount}</Table.Cell>
								<Table.Cell class="font-medium"
									>{passRate(tc.passCount, tc.totalExecs)}</Table.Cell
								>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</Card.Content>
		</Card.Root>
	{/if}

	<!-- Recent Runs -->
	{#if recentRuns.length > 0}
		<Card.Root>
			<Card.Header>
				<Card.Title class="text-sm font-medium">Recent Completed Runs</Card.Title>
			</Card.Header>
			<Card.Content class="p-0">
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>Name</Table.Head>
							<Table.Head class="w-24">Environment</Table.Head>
							<Table.Head class="w-20">Pass</Table.Head>
							<Table.Head class="w-20">Fail</Table.Head>
							<Table.Head class="w-28">Pass Rate</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each [...recentRuns].reverse() as run (run.id)}
							{@const rate = run.totalCount > 0 ? Math.round((run.passCount / run.totalCount) * 100) : 0}
							<Table.Row>
								<Table.Cell class="font-medium">{run.name}</Table.Cell>
								<Table.Cell>
									<Badge variant="outline">{run.environment}</Badge>
								</Table.Cell>
								<Table.Cell class="text-green-600">{run.passCount}</Table.Cell>
								<Table.Cell class="text-red-600">{run.failCount}</Table.Cell>
								<Table.Cell>
									<span
										class="font-medium {rate >= 80
											? 'text-green-600'
											: rate >= 50
												? 'text-yellow-600'
												: 'text-red-600'}"
									>
										{rate}%
									</span>
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</Card.Content>
		</Card.Root>
	{/if}

	<p class="text-muted-foreground text-center text-xs">
		Shared report generated by testmini
	</p>
</div>
