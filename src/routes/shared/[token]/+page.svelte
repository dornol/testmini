<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import ReportResultCharts from '$lib/components/reports/ReportResultCharts.svelte';
	import { formatReportCalendarDate } from '$lib/report-calendar';
	import { getLocale } from '$lib/paraglide/runtime.js';
	import * as m from '$lib/paraglide/messages.js';

	let { data } = $props();

	const envStats = $derived(data.envStats);
	const recentRuns = $derived(data.recentRuns);
	const priorityStats = $derived(data.priorityStats);
	const dailyResults = $derived(data.dailyResults);
	const topFailingCases = $derived(data.topFailingCases);
	const dateRange = $derived(data.dateRange);

	type MetricColumn = { label: string; tone?: string };
	type MetricRow = { id: string | number; name: string; key?: string; values: (string | number)[] };

	const total = $derived({ label: m.reports_executions() });
	const pass = $derived({ label: m.shared_pass(), tone: 'report-result-pass' });
	const fail = $derived({ label: m.shared_fail(), tone: 'report-result-fail' });
	const rate = $derived({ label: m.shared_pass_rate() });

	const activeDateLabel = $derived(
		dateRange.allTime
			? m.filter_all_time()
			: dateRange.from && dateRange.to
				? `${formatReportCalendarDate(dateRange.from, getLocale())} – ${formatReportCalendarDate(dateRange.to, getLocale())}`
				: m.filter_last_30_days()
	);

	function passRate(passCount: number, totalCount: number): string {
		return Number(totalCount) > 0 ? `${Math.round((passCount / totalCount) * 100)}%` : '—';
	}
</script>

{#snippet statistics(
	id: string,
	title: string,
	rowLabel: string,
	columns: MetricColumn[],
	rows: MetricRow[]
)}
	{#if rows.length}
		<Card.Root>
			<Card.Header><h2 {id} class="text-lg font-medium">{title}</h2></Card.Header>
			<Card.Content class="p-0">
				<Table.Root role="table" aria-labelledby={id} class="report-metrics sm:min-w-[30rem]">
					<Table.Header role="rowgroup">
						<Table.Row role="row">
							<Table.Head scope="col" role="columnheader">{rowLabel}</Table.Head>
							{#each columns as column (column.label)}
								<Table.Head scope="col" role="columnheader" class="sm:w-24"
									>{column.label}</Table.Head
								>
							{/each}
						</Table.Row>
					</Table.Header>
					<Table.Body role="rowgroup">
						{#each rows as row (row.id)}
							<Table.Row role="row">
								<Table.Head
									scope="row"
									role="rowheader"
									class="report-metric-wide h-auto whitespace-normal py-2 text-foreground"
								>
									{#if row.key}<span class="block text-xs text-muted-foreground">{row.key}</span
										>{/if}
									{row.name}
								</Table.Head>
								{#each columns as column, i (column.label)}
									<Table.Cell role="cell" class="whitespace-normal {column.tone ?? ''}">
										<span aria-hidden="true" class="block text-xs text-muted-foreground sm:hidden"
											>{column.label}</span
										>
										{row.values[i]}
									</Table.Cell>
								{/each}
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</Card.Content>
		</Card.Root>
	{/if}
{/snippet}

<svelte:head>
	<title>{data.reportName} · {m.report_shared_title()}</title>
</svelte:head>

<main class="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
	<header class="space-y-1">
		<h1 class="text-2xl font-bold [overflow-wrap:anywhere]">{data.reportName}</h1>
		<p class="text-sm text-muted-foreground [overflow-wrap:anywhere]">
			{data.projectName} · {activeDateLabel}
		</p>
	</header>

	{@render statistics(
		'shared-environments',
		m.shared_env_summary(),
		m.shared_environment(),
		[{ label: m.tr_title() }, pass, fail, rate],
		envStats.map((row) => ({
			id: row.environment,
			name: row.environment,
			values: [row.totalRuns, row.passCount, row.failCount, passRate(row.passCount, row.totalExecs)]
		}))
	)}

	<ReportResultCharts {recentRuns} {dailyResults} />

	{@render statistics(
		'shared-priorities',
		m.shared_priority_breakdown(),
		m.common_priority(),
		[total, pass, fail, rate],
		priorityStats.map((row) => ({
			id: row.priority,
			name: row.priority,
			values: [row.total, row.passCount, row.failCount, passRate(row.passCount, row.total)]
		}))
	)}

	{@render statistics(
		'shared-failing',
		m.shared_top_failing(),
		m.shared_test_case(),
		[total, { ...fail, label: m.shared_failures() }, rate],
		topFailingCases.map((row) => ({
			id: row.testCaseId,
			name: row.title,
			key: row.testCaseKey,
			values: [row.totalExecs, row.failCount, passRate(row.passCount, row.totalExecs)]
		}))
	)}

	{@render statistics(
		'shared-runs',
		m.shared_recent_runs(),
		m.shared_name(),
		[{ label: m.shared_environment() }, pass, fail, rate],
		[...recentRuns].reverse().map((row) => ({
			id: row.id,
			name: row.name,
			values: [
				row.environment,
				row.passCount,
				row.failCount,
				passRate(row.passCount, row.totalCount)
			]
		}))
	)}

	<footer class="text-center text-xs text-muted-foreground">{m.shared_generated_by()}</footer>
</main>
