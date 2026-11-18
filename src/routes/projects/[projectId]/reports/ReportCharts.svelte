<script lang="ts">
	import './report-results.css';
	import * as m from '$lib/paraglide/messages.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import PriorityBadge from '$lib/components/PriorityBadge.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import Chart from '$lib/components/Chart.svelte';
	import type { ChartConfiguration } from 'chart.js';
	import { untrack } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { formatDuration } from '$lib/format-utils';

	let {
		projectId,
		recentRuns,
		dailyResults,
		priorityStats,
		creatorStats,
		assigneeStats,
		executorStats,
		topFailingCases,
		flakyTests,
		staleTests,
		slowestTests,
		defectDensity,
		projectPriorities
	}: {
		projectId: number;
		recentRuns: Array<{
			id: number;
			name: string;
			environment: string;
			passCount: number;
			failCount: number;
			blockedCount: number;
			skippedCount: number;
			totalCount: number;
			finishedAt: Date | string | null;
		}>;
		dailyResults: Array<{
			date: string;
			passCount: number;
			failCount: number;
			blockedCount: number;
			skippedCount: number;
		}>;
		priorityStats: Array<{
			priority: string;
			total: number;
			passCount: number;
			failCount: number;
		}>;
		creatorStats: Array<{
			userId: string;
			userName: string;
			caseCount: number;
		}>;
		assigneeStats: Array<{
			userId: string;
			userName: string;
			assignedCount: number;
			totalExecs: number;
			passCount: number;
			failCount: number;
		}>;
		executorStats: Array<{
			userId: string;
			userName: string;
			execCount: number;
			passCount: number;
			failCount: number;
		}>;
		topFailingCases: Array<{
			testCaseId: number;
			testCaseKey: string;
			title: string;
			totalExecs: number;
			failCount: number;
			passCount: number;
		}>;
		flakyTests: Array<{
			testCaseId: number;
			testCaseKey: string;
			title: string;
			totalExecs: number;
			passCount: number;
			failCount: number;
		}>;
		staleTests: Array<{
			testCaseId: number;
			testCaseKey: string;
			title: string;
			priority: string;
			lastExecutedAt: Date | string | null;
		}>;
		slowestTests: Array<{
			testCaseId: number;
			testCaseKey: string;
			title: string;
			priority: string;
			avgDuration: number;
			maxDuration: number;
			execCount: number;
		}>;
		defectDensity: Array<{
			groupId: number | null;
			groupName: string | null;
			caseCount: number;
			defectCount: number;
		}>;
		projectPriorities: Array<{ name: string; color: string }>;
	} = $props();

	const selectedRunIds = new SvelteSet<number>();
	$effect(() => {
		const visible = new Set(recentRuns.map((run) => run.id));
		untrack(() => {
			for (const id of selectedRunIds) {
				if (!visible.has(id)) selectedRunIds.delete(id);
			}
		});
	});

	function toggleRun(id: number) {
		if (selectedRunIds.has(id)) {
			selectedRunIds.delete(id);
		} else {
			selectedRunIds.add(id);
		}
	}

	function toggleAll() {
		if (selectedRunIds.size === recentRuns.length) {
			selectedRunIds.clear();
		} else {
			selectedRunIds.clear();
			recentRuns.forEach((r) => selectedRunIds.add(r.id));
		}
	}

	function exportSelected() {
		const ids = Array.from(selectedRunIds).join(',');
		window.location.href = `/api/projects/${projectId}/reports/export?runs=${ids}`;
	}

	const trendBarConfig = $derived<ChartConfiguration>({
		type: 'bar',
		data: {
			labels: recentRuns.map((r) => (r.name.length > 10 ? r.name.slice(0, 10) + '..' : r.name)),
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

	function getPriorityColor(name: string): string {
		return projectPriorities.find((p) => p.name === name)?.color ?? '#6b7280';
	}

	function barWidth(value: number, total: number): string {
		if (total === 0) return '0%';
		return `${(value / total) * 100}%`;
	}
</script>

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
			<div class="overflow-x-auto">
				<Table.Root class="min-w-[640px]">
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
									<PriorityBadge name={ps.priority} color={getPriorityColor(ps.priority)} />
								</Table.Cell>
								<Table.Cell>{total}</Table.Cell>
								<Table.Cell class="report-result-pass">{pass}</Table.Cell>
								<Table.Cell class="report-result-fail">{fail}</Table.Cell>
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
			</div>
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
			<div class="overflow-x-auto">
				<Table.Root class="min-w-[480px]">
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
								<Table.Cell class="min-w-0 font-medium">
									<div class="truncate" title={cs.userName}>{cs.userName}</div>
								</Table.Cell>
								<Table.Cell>{cs.caseCount}</Table.Cell>
								<Table.Cell>
									<div class="bg-secondary flex h-2 w-full overflow-hidden rounded-full">
										<div
											class="bg-blue-500"
											style="width: {barWidth(cs.caseCount, maxCreatorCount)}"
										></div>
									</div>
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</div>
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
			<div class="overflow-x-auto">
				<Table.Root class="min-w-[640px]">
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
								<Table.Cell class="min-w-0 font-medium">
									<div class="truncate" title={as_.userName}>{as_.userName}</div>
								</Table.Cell>
								<Table.Cell>{as_.assignedCount}</Table.Cell>
								<Table.Cell class="report-result-pass">{pass}</Table.Cell>
								<Table.Cell class="report-result-fail">{fail}</Table.Cell>
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
			</div>
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
			<div class="overflow-x-auto">
				<Table.Root class="min-w-[640px]">
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
								<Table.Cell class="min-w-0 font-medium">
									<div class="truncate" title={es.userName}>{es.userName}</div>
								</Table.Cell>
								<Table.Cell>{total}</Table.Cell>
								<Table.Cell class="report-result-pass">{pass}</Table.Cell>
								<Table.Cell class="report-result-fail">{fail}</Table.Cell>
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
			</div>
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
			<div class="space-y-2 px-4 pb-4 sm:hidden">
				{#each topFailingCases as tc (tc.testCaseId)}
					{@const total = tc.totalExecs}
					{@const fail = tc.failCount}
					{@const pass = tc.passCount}
					<button
						type="button"
						class="w-full rounded-md border p-3 text-left transition-colors hover:bg-muted/50"
						onclick={() => {
							window.location.href = `/projects/${projectId}/test-cases/${tc.testCaseId}`;
						}}
					>
						<p class="font-mono text-xs text-muted-foreground">{tc.testCaseKey}</p>
						<p class="mt-1 text-sm font-medium [overflow-wrap:anywhere]">{tc.title}</p>
						<dl class="mt-3 grid grid-cols-2 gap-2 text-xs min-[420px]:grid-cols-4">
							<div>
								<dt class="text-muted-foreground">{m.reports_total()}</dt>
								<dd class="font-medium">{total}</dd>
							</div>
							<div>
								<dt class="text-muted-foreground">{m.reports_fail_count()}</dt>
								<dd class="font-medium report-result-fail">{fail}</dd>
							</div>
							<div>
								<dt class="text-muted-foreground">{m.reports_pass()}</dt>
								<dd class="font-medium report-result-pass">{pass}</dd>
							</div>
							<div>
								<dt class="text-muted-foreground">{m.reports_pass_rate()}</dt>
								<dd class="font-medium">{passRate(pass, total)}</dd>
							</div>
						</dl>
						<div class="mt-3 bg-secondary flex h-2 w-full overflow-hidden rounded-full">
							{#if pass > 0}
								<div class="bg-green-500" style="width: {barWidth(pass, total)}"></div>
							{/if}
							{#if fail > 0}
								<div class="bg-red-500" style="width: {barWidth(fail, total)}"></div>
							{/if}
						</div>
					</button>
				{/each}
			</div>
			<div class="hidden overflow-x-auto sm:block">
				<Table.Root class="min-w-[640px] table-fixed">
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
								onclick={() => {
									window.location.href = `/projects/${projectId}/test-cases/${tc.testCaseId}`;
								}}
							>
								<Table.Cell class="min-w-0">
									<div class="min-w-0">
										<span
											class="block truncate text-xs text-muted-foreground"
											title={tc.testCaseKey}
										>
											{tc.testCaseKey}
										</span>
										<span class="block truncate font-medium" title={tc.title}>{tc.title}</span>
									</div>
								</Table.Cell>
								<Table.Cell>{total}</Table.Cell>
								<Table.Cell class="report-result-fail font-medium">{fail}</Table.Cell>
								<Table.Cell class="report-result-pass">{pass}</Table.Cell>
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
			</div>
		</Card.Content>
	</Card.Root>
{/if}

<!-- Flaky Tests -->
{#if flakyTests.length > 0}
	<Card.Root>
		<Card.Header>
			<Card.Title class="text-sm font-medium">{m.trends_flaky_tests()}</Card.Title>
			<Card.Description>{m.trends_flaky_desc()}</Card.Description>
		</Card.Header>
		<Card.Content class="p-0">
			<div class="space-y-2 px-4 pb-4 sm:hidden">
				{#each flakyTests as tc (tc.testCaseId)}
					{@const total = tc.totalExecs}
					{@const pass = tc.passCount}
					{@const fail = tc.failCount}
					<button
						type="button"
						class="w-full rounded-md border p-3 text-left transition-colors hover:bg-muted/50"
						onclick={() => {
							window.location.href = `/projects/${projectId}/test-cases/${tc.testCaseId}`;
						}}
					>
						<div class="flex items-start gap-2">
							<Badge
								variant="outline"
								class="shrink-0 bg-yellow-50 text-yellow-700 border-yellow-300 text-xs"
								>{m.common_flaky()}</Badge
							>
							<div class="min-w-0">
								<p class="font-mono text-xs text-muted-foreground">{tc.testCaseKey}</p>
								<p class="mt-1 text-sm font-medium [overflow-wrap:anywhere]">{tc.title}</p>
							</div>
						</div>
						<dl class="mt-3 grid grid-cols-2 gap-2 text-xs min-[420px]:grid-cols-4">
							<div>
								<dt class="text-muted-foreground">{m.reports_total()}</dt>
								<dd class="font-medium">{total}</dd>
							</div>
							<div>
								<dt class="text-muted-foreground">{m.trends_pass()}</dt>
								<dd class="font-medium report-result-pass">{pass}</dd>
							</div>
							<div>
								<dt class="text-muted-foreground">{m.trends_fail()}</dt>
								<dd class="font-medium report-result-fail">{fail}</dd>
							</div>
							<div>
								<dt class="text-muted-foreground">{m.reports_pass_rate()}</dt>
								<dd class="font-medium">{passRate(pass, total)}</dd>
							</div>
						</dl>
						<div class="mt-3 bg-secondary flex h-2 w-full overflow-hidden rounded-full">
							{#if pass > 0}
								<div class="bg-green-500" style="width: {barWidth(pass, total)}"></div>
							{/if}
							{#if fail > 0}
								<div class="bg-red-500" style="width: {barWidth(fail, total)}"></div>
							{/if}
						</div>
					</button>
				{/each}
			</div>
			<div class="hidden overflow-x-auto sm:block">
				<Table.Root class="min-w-[640px] table-fixed">
					<Table.Header>
						<Table.Row>
							<Table.Head>{m.reports_test_case()}</Table.Head>
							<Table.Head class="w-28">{m.reports_total()}</Table.Head>
							<Table.Head class="w-28">{m.trends_pass()}</Table.Head>
							<Table.Head class="w-28">{m.trends_fail()}</Table.Head>
							<Table.Head class="w-28">{m.reports_pass_rate()}</Table.Head>
							<Table.Head class="w-40">{m.reports_distribution()}</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each flakyTests as tc (tc.testCaseId)}
							{@const total = tc.totalExecs}
							{@const pass = tc.passCount}
							{@const fail = tc.failCount}
							<Table.Row
								class="cursor-pointer"
								onclick={() => {
									window.location.href = `/projects/${projectId}/test-cases/${tc.testCaseId}`;
								}}
							>
								<Table.Cell class="min-w-0">
									<div class="flex min-w-0 items-center gap-2">
										<Badge
											variant="outline"
											class="shrink-0 bg-yellow-50 text-yellow-700 border-yellow-300 text-xs"
											>{m.common_flaky()}</Badge
										>
										<div class="min-w-0">
											<span
												class="block truncate text-xs text-muted-foreground"
												title={tc.testCaseKey}
											>
												{tc.testCaseKey}
											</span>
											<span class="block truncate font-medium" title={tc.title}>{tc.title}</span>
										</div>
									</div>
								</Table.Cell>
								<Table.Cell>{total}</Table.Cell>
								<Table.Cell class="report-result-pass">{pass}</Table.Cell>
								<Table.Cell class="report-result-fail font-medium">{fail}</Table.Cell>
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
			</div>
		</Card.Content>
	</Card.Root>
{/if}

<!-- Stale Test Cases -->
{#if staleTests.length > 0}
	<Card.Root>
		<Card.Header>
			<Card.Title class="text-sm font-medium">{m.stale_tests_title()}</Card.Title>
			<Card.Description>{m.stale_tests_desc()}</Card.Description>
		</Card.Header>
		<Card.Content class="p-0">
			<div class="space-y-2 px-4 pb-4 sm:hidden">
				{#each staleTests as tc (tc.testCaseId)}
					{@const daysAgo = tc.lastExecutedAt
						? Math.floor((Date.now() - new Date(tc.lastExecutedAt).getTime()) / 86400000)
						: null}
					<button
						type="button"
						class="w-full rounded-md border p-3 text-left transition-colors hover:bg-muted/50"
						onclick={() => {
							window.location.href = `/projects/${projectId}/test-cases/${tc.testCaseId}`;
						}}
					>
						<div class="flex items-start justify-between gap-3">
							<div class="min-w-0 flex-1">
								<p class="font-mono text-xs text-muted-foreground">{tc.testCaseKey}</p>
								<p class="mt-1 text-sm font-medium [overflow-wrap:anywhere]">{tc.title}</p>
							</div>
							<span class="shrink-0">
								<PriorityBadge name={tc.priority} color={getPriorityColor(tc.priority)} />
							</span>
						</div>
						<div class="mt-3">
							{#if daysAgo === null}
								<Badge variant="outline" class="bg-red-50 text-red-700 border-red-300 text-xs"
									>{m.stale_tests_never()}</Badge
								>
							{:else}
								<span
									class="text-sm text-muted-foreground {daysAgo > 30
										? 'font-medium report-result-caution'
										: ''}">{m.stale_tests_days_ago({ days: daysAgo })}</span
								>
							{/if}
						</div>
					</button>
				{/each}
			</div>
			<div class="hidden overflow-x-auto sm:block">
				<Table.Root class="min-w-[560px] table-fixed">
					<Table.Header>
						<Table.Row>
							<Table.Head>{m.reports_test_case()}</Table.Head>
							<Table.Head class="w-28">{m.common_priority()}</Table.Head>
							<Table.Head class="w-36">{m.stale_tests_last_executed()}</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each staleTests as tc (tc.testCaseId)}
							{@const daysAgo = tc.lastExecutedAt
								? Math.floor((Date.now() - new Date(tc.lastExecutedAt).getTime()) / 86400000)
								: null}
							<Table.Row
								class="cursor-pointer"
								onclick={() => {
									window.location.href = `/projects/${projectId}/test-cases/${tc.testCaseId}`;
								}}
							>
								<Table.Cell class="min-w-0">
									<div class="min-w-0">
										<span
											class="block truncate text-xs text-muted-foreground"
											title={tc.testCaseKey}
										>
											{tc.testCaseKey}
										</span>
										<span class="block truncate font-medium" title={tc.title}>{tc.title}</span>
									</div>
								</Table.Cell>
								<Table.Cell>
									<PriorityBadge name={tc.priority} color={getPriorityColor(tc.priority)} />
								</Table.Cell>
								<Table.Cell>
									{#if daysAgo === null}
										<Badge variant="outline" class="bg-red-50 text-red-700 border-red-300 text-xs"
											>{m.stale_tests_never()}</Badge
										>
									{:else}
										<span
											class="text-muted-foreground text-sm {daysAgo > 30
												? 'report-result-caution font-medium'
												: ''}">{m.stale_tests_days_ago({ days: daysAgo })}</span
										>
									{/if}
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</div>
		</Card.Content>
	</Card.Root>
{/if}

<!-- Slowest Tests -->
{#if slowestTests.length > 0}
	<Card.Root>
		<Card.Header>
			<Card.Title class="text-sm font-medium">{m.slowest_tests_title()}</Card.Title>
			<Card.Description>{m.slowest_tests_desc()}</Card.Description>
		</Card.Header>
		<Card.Content class="p-0">
			<div class="space-y-2 px-4 pb-4 sm:hidden">
				{#each slowestTests as tc (tc.testCaseId)}
					<button
						type="button"
						class="w-full rounded-md border p-3 text-left transition-colors hover:bg-muted/50"
						onclick={() => {
							window.location.href = `/projects/${projectId}/test-cases/${tc.testCaseId}`;
						}}
					>
						<div class="flex items-start justify-between gap-3">
							<div class="min-w-0 flex-1">
								<p class="font-mono text-xs text-muted-foreground">{tc.testCaseKey}</p>
								<p class="mt-1 text-sm font-medium [overflow-wrap:anywhere]">{tc.title}</p>
							</div>
							<span class="shrink-0">
								<PriorityBadge name={tc.priority} color={getPriorityColor(tc.priority)} />
							</span>
						</div>
						<dl class="mt-3 grid grid-cols-1 gap-2 text-xs min-[360px]:grid-cols-3">
							<div>
								<dt class="text-muted-foreground">{m.slowest_avg()}</dt>
								<dd class="font-medium">{formatDuration(tc.avgDuration)}</dd>
							</div>
							<div>
								<dt class="text-muted-foreground">{m.slowest_max()}</dt>
								<dd class="font-medium">{formatDuration(tc.maxDuration)}</dd>
							</div>
							<div>
								<dt class="text-muted-foreground">{m.slowest_execs()}</dt>
								<dd class="font-medium">{tc.execCount}</dd>
							</div>
						</dl>
					</button>
				{/each}
			</div>
			<div class="hidden overflow-x-auto sm:block">
				<Table.Root class="min-w-[640px] table-fixed">
					<Table.Header>
						<Table.Row>
							<Table.Head>{m.reports_test_case()}</Table.Head>
							<Table.Head class="w-28">{m.common_priority()}</Table.Head>
							<Table.Head class="w-28">{m.slowest_avg()}</Table.Head>
							<Table.Head class="w-28">{m.slowest_max()}</Table.Head>
							<Table.Head class="w-24">{m.slowest_execs()}</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each slowestTests as tc (tc.testCaseId)}
							<Table.Row
								class="cursor-pointer"
								onclick={() => {
									window.location.href = `/projects/${projectId}/test-cases/${tc.testCaseId}`;
								}}
							>
								<Table.Cell class="min-w-0">
									<div class="min-w-0">
										<span
											class="block truncate text-xs text-muted-foreground"
											title={tc.testCaseKey}
										>
											{tc.testCaseKey}
										</span>
										<span class="block truncate font-medium" title={tc.title}>{tc.title}</span>
									</div>
								</Table.Cell>
								<Table.Cell>
									<PriorityBadge name={tc.priority} color={getPriorityColor(tc.priority)} />
								</Table.Cell>
								<Table.Cell class="font-medium">{formatDuration(tc.avgDuration)}</Table.Cell>
								<Table.Cell class="text-muted-foreground"
									>{formatDuration(tc.maxDuration)}</Table.Cell
								>
								<Table.Cell class="text-muted-foreground">{tc.execCount}</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</div>
		</Card.Content>
	</Card.Root>
{/if}

<!-- Defect Density by Group -->
{#if defectDensity.length > 0 && defectDensity.some((d) => d.defectCount > 0)}
	{@const maxDefects = Math.max(...defectDensity.map((d) => d.defectCount))}
	<Card.Root>
		<Card.Header>
			<Card.Title class="text-sm font-medium">{m.defect_density_title()}</Card.Title>
			<Card.Description>{m.defect_density_desc()}</Card.Description>
		</Card.Header>
		<Card.Content class="p-0">
			<div class="space-y-2 px-4 pb-4 sm:hidden">
				{#each defectDensity.filter((d) => d.defectCount > 0) as dd (dd.groupId ?? 'ungrouped')}
					{@const density = dd.caseCount > 0 ? (dd.defectCount / dd.caseCount).toFixed(2) : '0'}
					<div class="rounded-md border p-3">
						<p class="break-words text-sm font-medium">{dd.groupName ?? m.defect_ungrouped()}</p>
						<dl class="mt-3 grid grid-cols-1 gap-2 text-xs min-[360px]:grid-cols-3">
							<div>
								<dt class="text-muted-foreground">{m.defect_cases()}</dt>
								<dd class="font-medium">{dd.caseCount}</dd>
							</div>
							<div>
								<dt class="text-muted-foreground">{m.defect_count()}</dt>
								<dd class="font-medium report-result-fail">{dd.defectCount}</dd>
							</div>
							<div>
								<dt class="text-muted-foreground">{m.defect_density()}</dt>
								<dd class="font-medium">{density}</dd>
							</div>
						</dl>
						<div class="mt-3 bg-secondary flex h-2 w-full overflow-hidden rounded-full">
							<div class="bg-red-500" style="width: {barWidth(dd.defectCount, maxDefects)}"></div>
						</div>
					</div>
				{/each}
			</div>
			<div class="hidden overflow-x-auto sm:block">
				<Table.Root class="min-w-[560px] table-fixed">
					<Table.Header>
						<Table.Row>
							<Table.Head>{m.defect_group()}</Table.Head>
							<Table.Head class="w-28">{m.defect_cases()}</Table.Head>
							<Table.Head class="w-28">{m.defect_count()}</Table.Head>
							<Table.Head class="w-28">{m.defect_density()}</Table.Head>
							<Table.Head class="w-40">{m.reports_distribution()}</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each defectDensity.filter((d) => d.defectCount > 0) as dd (dd.groupId ?? 'ungrouped')}
							{@const density = dd.caseCount > 0 ? (dd.defectCount / dd.caseCount).toFixed(2) : '0'}
							<Table.Row>
								<Table.Cell class="min-w-0 font-medium">
									<div class="truncate" title={dd.groupName ?? m.defect_ungrouped()}>
										{dd.groupName ?? m.defect_ungrouped()}
									</div>
								</Table.Cell>
								<Table.Cell>{dd.caseCount}</Table.Cell>
								<Table.Cell class="report-result-fail font-medium">{dd.defectCount}</Table.Cell>
								<Table.Cell>{density}</Table.Cell>
								<Table.Cell>
									<div class="bg-secondary flex h-2 w-full overflow-hidden rounded-full">
										<div
											class="bg-red-500"
											style="width: {barWidth(dd.defectCount, maxDefects)}"
										></div>
									</div>
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</div>
		</Card.Content>
	</Card.Root>
{/if}

<!-- Recent completed runs use one selection model and table at every width. -->
{#if recentRuns.length > 0}
	<Card.Root data-testid="recent-completed-runs">
		<Card.Header class="flex flex-wrap items-center justify-between gap-2">
			<h3 id="report-recent-heading" class="text-sm font-medium">{m.reports_recent_completed()}</h3>
			{#if selectedRunIds.size > 0}
				<Button size="sm" onclick={exportSelected}>
					{m.reports_export_selected({ count: selectedRunIds.size })}
				</Button>
			{/if}
		</Card.Header>
		<Card.Content class="p-0">
			{@const resultLabels = [
				m.reports_pass(),
				m.reports_fail(),
				m.dashboard_blocked(),
				m.dashboard_skipped(),
				m.reports_pass_rate()
			]}
			<Table.Root aria-labelledby="report-recent-heading" role="table" class="report-runs">
				<Table.Header role="rowgroup">
					<Table.Row role="row">
						<Table.Head role="columnheader" scope="col" class="w-12">
							<label class="inline-flex items-center gap-2">
								<input
									type="checkbox"
									checked={selectedRunIds.size === recentRuns.length}
									indeterminate={selectedRunIds.size > 0 && selectedRunIds.size < recentRuns.length}
									onchange={toggleAll}
								/>
								<span class="sm:sr-only">{m.reports_select_all()}</span>
							</label>
						</Table.Head>
						<Table.Head role="columnheader" scope="col">{m.common_name()}</Table.Head>
						<Table.Head role="columnheader" scope="col">{m.dashboard_env()}</Table.Head>
						{#each resultLabels as label (label)}
							<Table.Head role="columnheader" scope="col">{label}</Table.Head>
						{/each}
						<Table.Head role="columnheader" scope="col">{m.reports_finished()}</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body role="rowgroup">
					{#each [...recentRuns].reverse() as run (run.id)}
						{@const rate =
							run.totalCount > 0 ? Math.round((run.passCount / run.totalCount) * 100) : 0}
						<Table.Row role="row">
							<Table.Cell role="cell">
								<input
									type="checkbox"
									checked={selectedRunIds.has(run.id)}
									onchange={() => toggleRun(run.id)}
									aria-label={m.aria_select_item({ item: run.name })}
								/>
							</Table.Cell>
							<Table.Cell role="cell" class="report-run-title">
								<a
									href={`/projects/${projectId}/test-runs/${run.id}`}
									class="underline-offset-4 hover:underline">{run.name}</a
								>
							</Table.Cell>
							<Table.Cell role="cell" class="report-run-meta">{run.environment}</Table.Cell>
							{#each [run.passCount, run.failCount, run.blockedCount, run.skippedCount, `${rate}%`] as count, i (i)}
								<Table.Cell
									role="cell"
									class={[
										'report-result-pass',
										'report-result-fail',
										'report-result-blocked',
										'text-muted-foreground',
										rate >= 80
											? 'report-result-pass'
											: rate >= 50
												? 'report-result-caution'
												: 'report-result-fail'
									][i]}
								>
									<span aria-hidden="true" class="mr-1 text-muted-foreground sm:hidden"
										>{resultLabels[i]}</span
									>{count}
								</Table.Cell>
							{/each}
							<Table.Cell role="cell" class="report-run-meta"
								>{run.finishedAt ? new Date(run.finishedAt).toLocaleDateString() : '—'}</Table.Cell
							>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</Card.Content>
	</Card.Root>
{/if}
