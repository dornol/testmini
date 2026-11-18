<script lang="ts">
	import './report-results.css';
	import type { ChartConfiguration } from 'chart.js';
	import { mode } from 'mode-watcher';
	import Chart from '$lib/components/Chart.svelte';
	import * as Card from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';
	import * as m from '$lib/paraglide/messages.js';
	import { getLocale } from '$lib/paraglide/runtime.js';
	import { formatReportCalendarDate } from '$lib/report-calendar';

	type Counts = {
		passCount: number;
		failCount: number;
		blockedCount: number;
		skippedCount: number;
	};
	type Row = Counts & { key: number | string; label: string };

	let {
		recentRuns,
		dailyResults,
		heading = 'h2'
	}: {
		heading?: 'h2' | 'h3';
		recentRuns: Array<Counts & { id: number; name: string }>;
		dailyResults: Array<Counts & { date: string }>;
	} = $props();

	const columns = $derived([
		{ key: 'passCount', label: m.reports_pass(), light: '#15803d', dark: '#4ade80' },
		{ key: 'failCount', label: m.reports_fail(), light: '#b91c1c', dark: '#f87171' },
		{ key: 'blockedCount', label: m.dashboard_blocked(), light: '#b45309', dark: '#fbbf24' },
		{ key: 'skippedCount', label: m.dashboard_skipped(), light: '#475569', dark: '#94a3b8' }
	] as const);
	const sections = $derived([
		{
			key: 'report-results-by-run',
			title: m.reports_trend_title(),
			rowHeader: m.tr_run_name(),
			rows: [...recentRuns].reverse().map((run) => ({ ...run, key: run.id, label: run.name }))
		},
		{
			key: 'report-results-by-date',
			title: m.reports_daily_results(),
			rowHeader: m.common_date(),
			rows: dailyResults.map((day) => ({
				...day,
				key: day.date,
				label: formatReportCalendarDate(day.date, getLocale())
			}))
		}
	]);

	function chartConfig(rows: Row[]): ChartConfiguration<'bar'> {
		const dark = mode.current === 'dark';
		const color = dark ? '#cbd5e1' : '#475569';
		return {
			type: 'bar',
			data: {
				labels: rows.map(({ label }) => label),
				datasets: columns.map((column) => ({
					label: column.label,
					data: rows.map((row) => Number(row[column.key])),
					backgroundColor: dark ? column.dark : column.light
				}))
			},
			options: {
				responsive: true,
				animation: false,
				plugins: {
					legend: { position: 'bottom', labels: { color } },
					tooltip: { mode: 'index', intersect: false }
				},
				scales: {
					x: {
						stacked: true,
						grid: { display: false },
						ticks: {
							color,
							maxRotation: 0,
							callback(value) {
								const label = this.getLabelForValue(Number(value));
								return label.length > 14 ? label.slice(0, 14) + '…' : label;
							}
						}
					},
					y: {
						stacked: true,
						beginAtZero: true,
						grid: { color: dark ? '#334155' : '#e2e8f0' },
						ticks: { color, precision: 0 }
					}
				}
			}
		};
	}
</script>

{#if !recentRuns.length && !dailyResults.length}
	<p class="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
		{m.reports_no_execution_results()}
	</p>
{:else}
	{#each sections as section (section.key)}
		{#if section.rows.length}
			<Card.Root role="region" aria-labelledby={section.key}>
				<Card.Header>
					<svelte:element this={heading} id={section.key} class="text-lg font-medium">
						{section.title}
					</svelte:element>
				</Card.Header>
				<Card.Content class="min-w-0 space-y-3">
					<Chart config={chartConfig(section.rows)} aria-label={section.title} />
					<details class="rounded-md border">
						<summary
							class="cursor-pointer rounded-md px-3 py-2 text-sm font-medium hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
						>
							{m.reports_chart_data()}<span class="sr-only"> · {section.title}</span>
						</summary>
						<div class="p-2">
							<Table.Root
								role="table"
								class="report-metrics sm:min-w-[25rem]"
								aria-labelledby={section.key}
							>
								<Table.Header role="rowgroup">
									<Table.Row role="row">
										<Table.Head role="columnheader" scope="col">{section.rowHeader}</Table.Head>
										{#each columns as column (column.key)}
											<Table.Head role="columnheader" scope="col" class="text-right"
												>{column.label}</Table.Head
											>
										{/each}
									</Table.Row>
								</Table.Header>
								<Table.Body role="rowgroup">
									{#each section.rows as row (row.key)}
										<Table.Row role="row">
											<Table.Head
												scope="row"
												role="rowheader"
												class="report-metric-wide h-auto whitespace-normal py-2 text-foreground"
											>
												{row.label}
											</Table.Head>
											{#each columns as column (column.key)}
												<Table.Cell role="cell" class="sm:text-right">
													<span
														aria-hidden="true"
														class="block text-xs text-muted-foreground sm:hidden"
													>
														{column.label}
													</span>
													{row[column.key]}
												</Table.Cell>
											{/each}
										</Table.Row>
									{/each}
								</Table.Body>
							</Table.Root>
						</div>
					</details>
				</Card.Content>
			</Card.Root>
		{/if}
	{/each}
{/if}
