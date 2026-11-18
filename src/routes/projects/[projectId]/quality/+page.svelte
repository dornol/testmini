<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { getLocale } from '$lib/paraglide/runtime.js';
	import * as Card from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';
	import PageHeader from '$lib/components/patterns/PageHeader.svelte';
	import { Bot, Boxes, ChevronRight, ShieldCheck } from '@lucide/svelte';

	let { data } = $props();
	const basePath = $derived(`/projects/${data.project.id}`);
	const coveredModules = $derived(data.modules.filter((item) => item.testCaseCount > 0).length);
	const unassessed = $derived(data.totals.total - data.totals.assessed);
	const riskCount = (level: string) =>
		data.risk.find((item) => item.riskLevel === level)?.count ?? 0;
	const percent = (value: number, total: number) =>
		total
			? new Intl.NumberFormat(getLocale(), { style: 'percent', maximumFractionDigits: 0 }).format(
					value / total
				)
			: '—';
	const date = (value: Date | string) =>
		new Intl.DateTimeFormat(getLocale(), { dateStyle: 'medium', timeZone: 'UTC' }).format(
			new Date(value)
		);
</script>

{#snippet metric(title: string, value: string, detail: string, Icon: typeof Boxes)}
	<Card.Root class="min-w-0 py-0">
		<dl class="space-y-2 p-4">
			<dt class="flex items-center gap-2 text-sm font-medium">
				<Icon class="size-4 shrink-0 text-primary" aria-hidden="true" />{title}
			</dt>
			<dd class="text-2xl font-semibold tabular-nums">{value}</dd>
			<dd class="text-sm text-muted-foreground">{detail}</dd>
		</dl>
	</Card.Root>
{/snippet}

<div class="min-w-0 space-y-6">
	<PageHeader title={m.quality_title()} description={m.quality_description()} />

	<div class="grid gap-3 sm:grid-cols-3">
		{@render metric(
			m.quality_module_coverage(),
			percent(coveredModules, data.modules.length),
			data.modules.length
				? m.quality_linked_module_count({ count: coveredModules, total: data.modules.length })
				: m.quality_no_modules(),
			Boxes
		)}
		{@render metric(
			m.quality_risk_assessment(),
			percent(data.totals.assessed, data.totals.total),
			data.totals.total
				? m.quality_assessed_case_count({ count: data.totals.assessed, total: data.totals.total })
				: m.quality_no_cases(),
			ShieldCheck
		)}
		{@render metric(
			m.quality_automation_coverage(),
			percent(data.totals.automated, data.totals.total),
			data.totals.total
				? m.quality_automated_case_count({ count: data.totals.automated, total: data.totals.total })
				: m.quality_no_cases(),
			Bot
		)}
	</div>

	<section aria-labelledby="quality-attention" class="space-y-3 rounded-lg border bg-card p-4">
		<div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
			<h3 id="quality-attention" class="text-base font-semibold">{m.quality_action_required()}</h3>
			<a
				href={`${basePath}/test-cases`}
				class="text-sm font-medium text-primary underline underline-offset-4"
				>{m.nav_test_cases()}</a
			>
		</div>
		{#if data.modules.length || data.totals.total}
			<dl class="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
				{#each [[m.quality_uncovered_modules(), data.modules.length - coveredModules], [m.quality_unassessed_cases(), unassessed], [m.quality_high_risk_cases(), riskCount('HIGH')], [m.quality_critical_risk_cases(), riskCount('CRITICAL')]] as [label, count] (label)}
					<div class="flex items-center justify-between gap-2 rounded-md bg-muted/60 px-3 py-2">
						<dt class="text-sm">{label}</dt>
						<dd class="font-semibold tabular-nums">{count}</dd>
					</div>
				{/each}
			</dl>
		{:else}
			<p class="text-sm text-muted-foreground">{m.quality_no_review_data()}</p>
		{/if}
	</section>

	<div class="grid min-w-0 gap-4 xl:grid-cols-2">
		<section aria-labelledby="quality-modules" class="min-w-0 space-y-3">
			<h3 id="quality-modules" class="text-base font-semibold">{m.quality_module_coverage()}</h3>
			{#if data.modules.length}
				<Table.Root
					aria-labelledby="quality-modules"
					aria-describedby="quality-module-results"
					class="table-fixed"
				>
					<Table.Header>
						<Table.Row>
							<Table.Head scope="col">{m.quality_module()}</Table.Head>
							<Table.Head scope="col" class="w-[22%] text-right">{m.quality_cases()}</Table.Head>
							<Table.Head scope="col" class="w-[20%] text-right">{m.dashboard_pass()}</Table.Head>
							<Table.Head scope="col" class="w-[20%] text-right">{m.dashboard_fail()}</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each data.modules as item (item.id)}
							<Table.Row>
								<th scope="row" class="px-4 py-2.5 text-start font-medium [overflow-wrap:anywhere]"
									>{item.name}</th
								>
								<Table.Cell class="text-right">{item.testCaseCount}</Table.Cell>
								<Table.Cell class="text-right text-emerald-700 dark:text-emerald-400"
									>{item.passCount}</Table.Cell
								>
								<Table.Cell class="text-right text-destructive">{item.failCount}</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
				<p id="quality-module-results" class="text-xs text-muted-foreground">
					{m.quality_module_results_hint()}
				</p>
			{:else}
				<p class="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
					{m.quality_no_modules()}
				</p>
			{/if}
		</section>

		<section aria-labelledby="quality-runs" class="min-w-0 space-y-3">
			<h3 id="quality-runs" class="text-base font-semibold">{m.quality_recent_automation()}</h3>
			{#if data.recentAutomationRuns.length}
				<ul class="divide-y rounded-lg border bg-card">
					{#each data.recentAutomationRuns as run (run.id)}
						<li class="min-w-0">
							<a
								href={`${basePath}/test-runs/${run.id}`}
								class="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md p-3 hover:bg-muted"
							>
								<div class="min-w-0 space-y-1">
									<p class="text-sm font-medium [overflow-wrap:anywhere]">{run.name}</p>
									<p class="text-xs text-muted-foreground [overflow-wrap:anywhere]">
										{run.environment} · {date(run.createdAt)}
									</p>
									<p class="text-xs text-muted-foreground tabular-nums">
										{m.quality_run_pass_count({ count: run.passed, total: run.total })} · {m.dashboard_fail()}
										{run.failed}
									</p>
								</div>
								<ChevronRight class="size-4 text-muted-foreground" aria-hidden="true" />
							</a>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
					{m.quality_no_automation_runs()}
				</p>
			{/if}
		</section>
	</div>
</div>
