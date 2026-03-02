<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import Chart from '$lib/components/Chart.svelte';
	import type { ChartConfiguration } from 'chart.js';

	let { data } = $props();

	const envStats = $derived(data.envStats);
	const recentRuns = $derived(data.recentRuns);
	const priorityStats = $derived(data.priorityStats);
	const creatorStats = $derived(data.creatorStats);
	const assigneeStats = $derived(data.assigneeStats);
	const dailyResults = $derived(data.dailyResults);
	const executorStats = $derived(data.executorStats);
	const topFailingCases = $derived(data.topFailingCases);

	let selectedRunIds = $state(new Set<number>());

	function toggleRun(id: number) {
		const next = new Set(selectedRunIds);
		if (next.has(id)) {
			next.delete(id);
		} else {
			next.add(id);
		}
		selectedRunIds = next;
	}

	function toggleAll() {
		if (selectedRunIds.size === recentRuns.length) {
			selectedRunIds = new Set();
		} else {
			selectedRunIds = new Set(recentRuns.map((r) => r.id));
		}
	}

	function exportSelected() {
		const ids = Array.from(selectedRunIds).join(',');
		window.location.href = `/api/projects/${data.project.id}/reports/export?runs=${ids}`;
	}

	const trendBarConfig = $derived<ChartConfiguration>({
		type: 'bar',
		data: {
			labels: recentRuns.map((r) =>
				r.name.length > 10 ? r.name.slice(0, 10) + '..' : r.name
			),
			datasets: [
				{
					label: m.reports_pass(),
					data: recentRuns.map((r) => r.passCount),
					backgroundColor: '#22c55e'
				},
				{
					label: m.reports_fail(),
					data: recentRuns.map((r) => r.failCount),
					backgroundColor: '#ef4444'
				},
				{
					label: m.dashboard_blocked(),
					data: recentRuns.map((r) => r.blockedCount),
					backgroundColor: '#f97316'
				},
				{
					label: m.dashboard_skipped(),
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
					label: m.reports_pass(),
					data: dailyResults.map((d) => d.passCount),
					backgroundColor: '#22c55e'
				},
				{
					label: m.reports_fail(),
					data: dailyResults.map((d) => d.failCount),
					backgroundColor: '#ef4444'
				},
				{
					label: m.dashboard_blocked(),
					data: dailyResults.map((d) => d.blockedCount),
					backgroundColor: '#f97316'
				},
				{
					label: m.dashboard_skipped(),
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

	function passRate(pass: number, total: number): string {
		if (total === 0) return '-';
		return `${Math.round((pass / total) * 100)}%`;
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

	function barWidth(value: number, total: number): string {
		if (total === 0) return '0%';
		return `${(value / total) * 100}%`;
	}
</script>

<div class="space-y-4">
	<!-- Environment Breakdown -->
	<Card.Root>
		<Card.Header>
			<Card.Title class="text-sm font-medium">{m.reports_env_pass_rate()}</Card.Title>
		</Card.Header>
		<Card.Content>
			{#if envStats.length === 0}
				<p class="text-muted-foreground text-sm">{m.reports_no_runs()}</p>
			{:else}
				<div class="grid gap-4 sm:grid-cols-2">
					{#each envStats as env (env.environment)}
						{@const rate = env.totalExecs > 0 ? Math.round((env.passCount / env.totalExecs) * 100) : 0}
						<div class="rounded-lg border p-4">
							<div class="flex items-center justify-between">
								<Badge variant="outline">{env.environment}</Badge>
								<span class="text-2xl font-bold {rate >= 80 ? 'text-green-600' : rate >= 50 ? 'text-yellow-600' : env.totalExecs === 0 ? '' : 'text-red-600'}">
									{env.totalExecs > 0 ? `${rate}%` : '-'}
								</span>
							</div>
							<div class="mt-3 space-y-1">
								<div class="bg-secondary flex h-2 overflow-hidden rounded-full">
									{#if env.passCount > 0}
										<div class="bg-green-500" style="width: {barWidth(env.passCount, env.totalExecs)}"></div>
									{/if}
									{#if env.failCount > 0}
										<div class="bg-red-500" style="width: {barWidth(env.failCount, env.totalExecs)}"></div>
									{/if}
								</div>
								<div class="text-muted-foreground flex justify-between text-xs">
									<span>{m.reports_runs_count({ count: env.totalRuns })}</span>
									<span>{m.reports_pass_fail({ pass: env.passCount, fail: env.failCount })}</span>
								</div>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</Card.Content>
	</Card.Root>

	<!-- Pass Rate Trend (bar chart) -->
	{#if recentRuns.length > 0}
		<Card.Root>
			<Card.Header>
				<Card.Title class="text-sm font-medium">{m.reports_trend_title()}</Card.Title>
			</Card.Header>
			<Card.Content>
				<Chart config={trendBarConfig} />
			</Card.Content>
		</Card.Root>
	{/if}

	<!-- Daily Test Run Results (stacked bar chart) -->
	{#if dailyResults.length > 0}
		<Card.Root>
			<Card.Header>
				<Card.Title class="text-sm font-medium">{m.reports_daily_results()}</Card.Title>
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
				<Card.Title class="text-sm font-medium">{m.reports_by_priority()}</Card.Title>
			</Card.Header>
			<Card.Content class="p-0">
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>{m.common_priority()}</Table.Head>
							<Table.Head class="w-28">{m.reports_total()}</Table.Head>
							<Table.Head class="w-28">{m.reports_pass()}</Table.Head>
							<Table.Head class="w-28">{m.reports_fail()}</Table.Head>
							<Table.Head class="w-28">{m.reports_pass_rate()}</Table.Head>
							<Table.Head class="w-40">{m.reports_distribution()}</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each priorityStats as ps (ps.priority)}
							{@const total = ps.total}
							{@const pass = ps.passCount}
							{@const fail = ps.failCount}
							<Table.Row>
								<Table.Cell>
									<Badge variant={priorityVariant(ps.priority)}>{ps.priority}</Badge>
								</Table.Cell>
								<Table.Cell>{total}</Table.Cell>
								<Table.Cell class="text-green-600">{pass}</Table.Cell>
								<Table.Cell class="text-red-600">{fail}</Table.Cell>
								<Table.Cell class="font-medium">{passRate(pass, total)}</Table.Cell>
								<Table.Cell>
									<div class="bg-secondary flex h-2 w-full overflow-hidden rounded-full">
										{#if pass > 0}
											<div class="bg-green-500" style="width: {barWidth(pass, total)}"></div>
										{/if}
										{#if fail > 0}
											<div class="bg-red-500" style="width: {barWidth(fail, total)}"></div>
										{/if}
									</div>
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</Card.Content>
		</Card.Root>
	{/if}

	<!-- Test Cases by Creator -->
	{#if creatorStats.length > 0}
		{@const maxCreatorCount = Math.max(...creatorStats.map((c) => c.caseCount))}
		<Card.Root>
			<Card.Header>
				<Card.Title class="text-sm font-medium">{m.reports_by_creator()}</Card.Title>
			</Card.Header>
			<Card.Content class="p-0">
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>{m.reports_creator()}</Table.Head>
							<Table.Head class="w-28">{m.reports_case_count()}</Table.Head>
							<Table.Head class="w-40">{m.reports_distribution()}</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each creatorStats as cs (cs.userId)}
							<Table.Row>
								<Table.Cell class="font-medium">{cs.userName}</Table.Cell>
								<Table.Cell>{cs.caseCount}</Table.Cell>
								<Table.Cell>
									<div class="bg-secondary flex h-2 w-full overflow-hidden rounded-full">
										<div class="bg-blue-500" style="width: {barWidth(cs.caseCount, maxCreatorCount)}"></div>
									</div>
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</Card.Content>
		</Card.Root>
	{/if}

	<!-- Pass/Fail Rate by Assignee -->
	{#if assigneeStats.length > 0}
		<Card.Root>
			<Card.Header>
				<Card.Title class="text-sm font-medium">{m.reports_by_assignee()}</Card.Title>
			</Card.Header>
			<Card.Content class="p-0">
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>{m.reports_assignee()}</Table.Head>
							<Table.Head class="w-28">{m.reports_assigned()}</Table.Head>
							<Table.Head class="w-28">{m.reports_pass()}</Table.Head>
							<Table.Head class="w-28">{m.reports_fail()}</Table.Head>
							<Table.Head class="w-28">{m.reports_pass_rate()}</Table.Head>
							<Table.Head class="w-40">{m.reports_distribution()}</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each assigneeStats as as_ (as_.userId)}
							{@const total = as_.totalExecs}
							{@const pass = as_.passCount}
							{@const fail = as_.failCount}
							<Table.Row>
								<Table.Cell class="font-medium">{as_.userName}</Table.Cell>
								<Table.Cell>{as_.assignedCount}</Table.Cell>
								<Table.Cell class="text-green-600">{pass}</Table.Cell>
								<Table.Cell class="text-red-600">{fail}</Table.Cell>
								<Table.Cell class="font-medium">{passRate(pass, total)}</Table.Cell>
								<Table.Cell>
									<div class="bg-secondary flex h-2 w-full overflow-hidden rounded-full">
										{#if pass > 0}
											<div class="bg-green-500" style="width: {barWidth(pass, total)}"></div>
										{/if}
										{#if fail > 0}
											<div class="bg-red-500" style="width: {barWidth(fail, total)}"></div>
										{/if}
									</div>
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</Card.Content>
		</Card.Root>
	{/if}

	<!-- Activity by Executor -->
	{#if executorStats.length > 0}
		{@const maxExecCount = Math.max(...executorStats.map((e) => e.execCount))}
		<Card.Root>
			<Card.Header>
				<Card.Title class="text-sm font-medium">{m.reports_by_executor()}</Card.Title>
			</Card.Header>
			<Card.Content class="p-0">
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>{m.reports_executor()}</Table.Head>
							<Table.Head class="w-28">{m.reports_executions()}</Table.Head>
							<Table.Head class="w-28">{m.reports_pass()}</Table.Head>
							<Table.Head class="w-28">{m.reports_fail()}</Table.Head>
							<Table.Head class="w-28">{m.reports_pass_rate()}</Table.Head>
							<Table.Head class="w-40">{m.reports_distribution()}</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each executorStats as es (es.userId)}
							{@const total = es.execCount}
							{@const pass = es.passCount}
							{@const fail = es.failCount}
							<Table.Row>
								<Table.Cell class="font-medium">{es.userName}</Table.Cell>
								<Table.Cell>{total}</Table.Cell>
								<Table.Cell class="text-green-600">{pass}</Table.Cell>
								<Table.Cell class="text-red-600">{fail}</Table.Cell>
								<Table.Cell class="font-medium">{passRate(pass, total)}</Table.Cell>
								<Table.Cell>
									<div class="bg-secondary flex h-2 w-full overflow-hidden rounded-full">
										{#if pass > 0}
											<div class="bg-green-500" style="width: {barWidth(pass, total)}"></div>
										{/if}
										{#if fail > 0}
											<div class="bg-red-500" style="width: {barWidth(fail, total)}"></div>
										{/if}
									</div>
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</Card.Content>
		</Card.Root>
	{/if}

	<!-- Top Failing Test Cases -->
	{#if topFailingCases.length > 0}
		{@const maxFailCount = Math.max(...topFailingCases.map((t) => t.failCount))}
		<Card.Root>
			<Card.Header>
				<Card.Title class="text-sm font-medium">{m.reports_top_failing()}</Card.Title>
			</Card.Header>
			<Card.Content class="p-0">
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>{m.reports_test_case()}</Table.Head>
							<Table.Head class="w-28">{m.reports_total()}</Table.Head>
							<Table.Head class="w-28">{m.reports_fail_count()}</Table.Head>
							<Table.Head class="w-28">{m.reports_pass()}</Table.Head>
							<Table.Head class="w-28">{m.reports_pass_rate()}</Table.Head>
							<Table.Head class="w-40">{m.reports_distribution()}</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each topFailingCases as tc (tc.testCaseId)}
							{@const total = tc.totalExecs}
							{@const fail = tc.failCount}
							{@const pass = tc.passCount}
							<Table.Row
								class="cursor-pointer"
								onclick={() => { window.location.href = `/projects/${data.project.id}/test-cases/${tc.testCaseId}`; }}
							>
								<Table.Cell>
									<div>
										<span class="text-muted-foreground text-xs">{tc.testCaseKey}</span>
										<span class="ml-1 font-medium">{tc.title}</span>
									</div>
								</Table.Cell>
								<Table.Cell>{total}</Table.Cell>
								<Table.Cell class="text-red-600 font-medium">{fail}</Table.Cell>
								<Table.Cell class="text-green-600">{pass}</Table.Cell>
								<Table.Cell class="font-medium">{passRate(pass, total)}</Table.Cell>
								<Table.Cell>
									<div class="bg-secondary flex h-2 w-full overflow-hidden rounded-full">
										{#if pass > 0}
											<div class="bg-green-500" style="width: {barWidth(pass, total)}"></div>
										{/if}
										{#if fail > 0}
											<div class="bg-red-500" style="width: {barWidth(fail, total)}"></div>
										{/if}
									</div>
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</Card.Content>
		</Card.Root>
	{/if}

	<!-- Recent Completed Runs Table -->
	{#if recentRuns.length > 0}
		<Card.Root>
			<Card.Header class="flex flex-row items-center justify-between">
				<Card.Title class="text-sm font-medium">{m.reports_recent_completed()}</Card.Title>
				{#if selectedRunIds.size > 0}
					<Button size="sm" class="h-7 text-xs" onclick={exportSelected}>
						{m.reports_export_selected({ count: selectedRunIds.size })}
					</Button>
				{/if}
			</Card.Header>
			<Card.Content class="p-0">
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head class="w-10 px-2">
								<input
									type="checkbox"
									checked={recentRuns.length > 0 && selectedRunIds.size === recentRuns.length}
									onchange={toggleAll}
									aria-label={m.reports_select_all()}
									class="h-4 w-4 rounded border-gray-300"
								/>
							</Table.Head>
							<Table.Head>{m.common_name()}</Table.Head>
							<Table.Head class="w-24">{m.dashboard_env()}</Table.Head>
							<Table.Head class="w-20">{m.reports_pass()}</Table.Head>
							<Table.Head class="w-20">{m.reports_fail()}</Table.Head>
							<Table.Head class="w-24">{m.dashboard_blocked()}</Table.Head>
							<Table.Head class="w-24">{m.dashboard_skipped()}</Table.Head>
							<Table.Head class="w-28">{m.reports_pass_rate()}</Table.Head>
							<Table.Head class="w-32">{m.reports_finished()}</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each [...recentRuns].reverse() as run (run.id)}
							{@const rate = run.totalCount > 0 ? Math.round((run.passCount / run.totalCount) * 100) : 0}
							<Table.Row
								class="cursor-pointer"
								onclick={() => { window.location.href = `/projects/${data.project.id}/test-runs/${run.id}`; }}
							>
								<Table.Cell class="px-2" onclick={(e: MouseEvent) => e.stopPropagation()}>
									<input
										type="checkbox"
										checked={selectedRunIds.has(run.id)}
										onchange={() => toggleRun(run.id)}
										class="h-4 w-4 rounded border-gray-300"
									/>
								</Table.Cell>
								<Table.Cell class="font-medium">{run.name}</Table.Cell>
								<Table.Cell>
									<Badge variant="outline">{run.environment}</Badge>
								</Table.Cell>
								<Table.Cell class="text-green-600">{run.passCount}</Table.Cell>
								<Table.Cell class="text-red-600">{run.failCount}</Table.Cell>
								<Table.Cell class="text-orange-600">{run.blockedCount}</Table.Cell>
								<Table.Cell class="text-gray-500">{run.skippedCount}</Table.Cell>
								<Table.Cell>
									<span class="font-medium {rate >= 80 ? 'text-green-600' : rate >= 50 ? 'text-yellow-600' : 'text-red-600'}">
										{rate}%
									</span>
								</Table.Cell>
								<Table.Cell class="text-muted-foreground text-xs">
									{run.finishedAt ? new Date(run.finishedAt).toLocaleDateString() : '-'}
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</Card.Content>
		</Card.Root>
	{/if}
</div>
