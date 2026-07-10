<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import Chart from '$lib/components/Chart.svelte';
	import type { ChartConfiguration } from 'chart.js';
	import * as m from '$lib/paraglide/messages.js';

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
			? m.filter_all_time()
			: dateRange.from && dateRange.to
				? `${formatDisplayDate(dateRange.from)} – ${formatDisplayDate(dateRange.to)}`
				: m.filter_last_30_days()
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
			labels: recentRuns.map((r) => (r.name.length > 10 ? r.name.slice(0, 10) + '..' : r.name)),
			datasets: [
				{
					label: m.shared_pass(),
					data: recentRuns.map((r) => r.passCount),
					backgroundColor: '#22c55e'
				},
				{
					label: m.shared_fail(),
					data: recentRuns.map((r) => r.failCount),
					backgroundColor: '#ef4444'
				},
				{
					label: m.shared_blocked(),
					data: recentRuns.map((r) => r.blockedCount),
					backgroundColor: '#f97316'
				},
				{
					label: m.shared_skipped(),
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
					label: m.shared_pass(),
					data: dailyResults.map((d) => d.passCount),
					backgroundColor: '#22c55e'
				},
				{
					label: m.shared_fail(),
					data: dailyResults.map((d) => d.failCount),
					backgroundColor: '#ef4444'
				},
				{
					label: m.shared_blocked(),
					data: dailyResults.map((d) => d.blockedCount),
					backgroundColor: '#f97316'
				},
				{
					label: m.shared_skipped(),
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

<div class="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
	<!-- Header -->
	<div class="space-y-1 text-center">
		<h1 class="break-words text-2xl font-bold">{data.reportName}</h1>
		<p class="text-muted-foreground break-words text-sm">
			{data.projectName} &middot; {activeDateLabel}
		</p>
	</div>

	<!-- Environment Breakdown -->
	{#if envStats.length > 0}
		<Card.Root>
			<Card.Header>
				<Card.Title class="text-sm font-medium">{m.shared_env_summary()}</Card.Title>
			</Card.Header>
			<Card.Content>
				<div class="grid gap-4 sm:grid-cols-2">
					{#each envStats as env (env.environment)}
						{@const rate =
							env.totalExecs > 0 ? Math.round((env.passCount / env.totalExecs) * 100) : 0}
						<div class="rounded-lg border p-4">
							<div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
								<Badge variant="outline" class="w-fit max-w-full whitespace-normal break-words"
									>{env.environment}</Badge
								>
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
								<div
									class="text-muted-foreground flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs"
								>
									<span>{m.shared_runs({ count: env.totalRuns })}</span>
									<span>{m.shared_pass_fail({ pass: env.passCount, fail: env.failCount })}</span>
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
				<Card.Title class="text-sm font-medium">{m.shared_pass_rate_trend()}</Card.Title>
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
				<Card.Title class="text-sm font-medium">{m.shared_daily_results()}</Card.Title>
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
				<Card.Title class="text-sm font-medium">{m.shared_priority_breakdown()}</Card.Title>
			</Card.Header>
			<Card.Content class="p-0">
				<Table.Root class="hidden md:table">
					<Table.Header>
						<Table.Row>
							<Table.Head>{m.common_priority()}</Table.Head>
							<Table.Head class="w-28">{m.shared_total()}</Table.Head>
							<Table.Head class="w-28">{m.shared_pass()}</Table.Head>
							<Table.Head class="w-28">{m.shared_fail()}</Table.Head>
							<Table.Head class="w-28">{m.shared_pass_rate()}</Table.Head>
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
								<Table.Cell class="font-medium">{passRate(ps.passCount, ps.total)}</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
				<div class="space-y-3 p-4 md:hidden">
					{#each priorityStats as ps (ps.priority)}
						<div class="rounded-md border p-3">
							<div>
								<Badge variant="outline">{ps.priority}</Badge>
							</div>
							<div class="mt-3 grid grid-cols-2 gap-2 text-sm min-[420px]:grid-cols-4">
								<div>
									<p class="text-muted-foreground text-xs">{m.shared_total()}</p>
									<p class="font-medium">{ps.total}</p>
								</div>
								<div>
									<p class="text-muted-foreground text-xs">{m.shared_pass()}</p>
									<p class="font-medium text-green-600">{ps.passCount}</p>
								</div>
								<div>
									<p class="text-muted-foreground text-xs">{m.shared_fail()}</p>
									<p class="font-medium text-red-600">{ps.failCount}</p>
								</div>
								<div>
									<p class="text-muted-foreground text-xs">{m.shared_pass_rate()}</p>
									<p class="font-medium">{passRate(ps.passCount, ps.total)}</p>
								</div>
							</div>
						</div>
					{/each}
				</div>
			</Card.Content>
		</Card.Root>
	{/if}

	<!-- Top Failing Test Cases -->
	{#if topFailingCases.length > 0}
		<Card.Root>
			<Card.Header>
				<Card.Title class="text-sm font-medium">{m.shared_top_failing()}</Card.Title>
			</Card.Header>
			<Card.Content class="p-0">
				<Table.Root class="hidden md:table">
					<Table.Header>
						<Table.Row>
							<Table.Head>{m.shared_test_case()}</Table.Head>
							<Table.Head class="w-28">{m.shared_total()}</Table.Head>
							<Table.Head class="w-28">{m.shared_failures()}</Table.Head>
							<Table.Head class="w-28">{m.shared_pass_rate()}</Table.Head>
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
								<Table.Cell class="font-medium">{passRate(tc.passCount, tc.totalExecs)}</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
				<div class="space-y-3 p-4 md:hidden">
					{#each topFailingCases as tc (tc.testCaseId)}
						<div class="rounded-md border p-3">
							<div class="space-y-1">
								<p class="text-muted-foreground text-xs break-all">{tc.testCaseKey}</p>
								<p class="text-sm font-medium break-words">{tc.title}</p>
							</div>
							<div class="mt-3 grid grid-cols-1 gap-2 text-sm min-[360px]:grid-cols-3">
								<div>
									<p class="text-muted-foreground text-xs">{m.shared_total()}</p>
									<p class="font-medium">{tc.totalExecs}</p>
								</div>
								<div>
									<p class="text-muted-foreground text-xs">{m.shared_failures()}</p>
									<p class="font-medium text-red-600">{tc.failCount}</p>
								</div>
								<div>
									<p class="text-muted-foreground text-xs">{m.shared_pass_rate()}</p>
									<p class="font-medium">{passRate(tc.passCount, tc.totalExecs)}</p>
								</div>
							</div>
						</div>
					{/each}
				</div>
			</Card.Content>
		</Card.Root>
	{/if}

	<!-- Recent Runs -->
	{#if recentRuns.length > 0}
		<Card.Root>
			<Card.Header>
				<Card.Title class="text-sm font-medium">{m.shared_recent_runs()}</Card.Title>
			</Card.Header>
			<Card.Content class="p-0">
				<Table.Root class="hidden md:table">
					<Table.Header>
						<Table.Row>
							<Table.Head>{m.shared_name()}</Table.Head>
							<Table.Head class="w-24">{m.shared_environment()}</Table.Head>
							<Table.Head class="w-20">{m.shared_pass()}</Table.Head>
							<Table.Head class="w-20">{m.shared_fail()}</Table.Head>
							<Table.Head class="w-28">{m.shared_pass_rate()}</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each [...recentRuns].reverse() as run (run.id)}
							{@const rate =
								run.totalCount > 0 ? Math.round((run.passCount / run.totalCount) * 100) : 0}
							<Table.Row>
								<Table.Cell class="font-medium">
									<span class="block truncate">{run.name}</span>
								</Table.Cell>
								<Table.Cell>
									<Badge variant="outline" class="max-w-full truncate">{run.environment}</Badge>
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
				<div class="space-y-3 p-4 md:hidden">
					{#each [...recentRuns].reverse() as run (run.id)}
						{@const rate =
							run.totalCount > 0 ? Math.round((run.passCount / run.totalCount) * 100) : 0}
						<div class="rounded-md border p-3">
							<div class="space-y-2">
								<p class="text-sm font-medium break-words">{run.name}</p>
								<Badge variant="outline" class="w-fit max-w-full whitespace-normal break-words"
									>{run.environment}</Badge
								>
							</div>
							<div class="mt-3 grid grid-cols-1 gap-2 text-sm min-[360px]:grid-cols-3">
								<div>
									<p class="text-muted-foreground text-xs">{m.shared_pass()}</p>
									<p class="font-medium text-green-600">{run.passCount}</p>
								</div>
								<div>
									<p class="text-muted-foreground text-xs">{m.shared_fail()}</p>
									<p class="font-medium text-red-600">{run.failCount}</p>
								</div>
								<div>
									<p class="text-muted-foreground text-xs">{m.shared_pass_rate()}</p>
									<p
										class="font-medium {rate >= 80
											? 'text-green-600'
											: rate >= 50
												? 'text-yellow-600'
												: 'text-red-600'}"
									>
										{rate}%
									</p>
								</div>
							</div>
						</div>
					{/each}
				</div>
			</Card.Content>
		</Card.Root>
	{/if}

	<p class="text-muted-foreground text-center text-xs">
		{m.shared_generated_by()}
	</p>
</div>
