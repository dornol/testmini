<script lang="ts">
	import { executionStatusLabel } from '$lib/execution-status';
	import * as m from '$lib/paraglide/messages.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import PriorityBadge from '$lib/components/PriorityBadge.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import { formatCsvRow } from '$lib/csv-format';

	type ProjectPriority = { name: string; color: string };
	type Kind = 'same' | 'regression' | 'improvement' | 'changed' | 'onlyA' | 'onlyB';

	let { data } = $props();

	type Row = (typeof data.rows)[number];

	let filter = $state<'all' | 'diff' | 'regression'>('all');

	// The kind of change is spelled out in text; row tints and glyphs only reinforce it.
	function kindOf(a: string | null, b: string | null): Kind {
		if (a === null) return 'onlyB';
		if (b === null) return 'onlyA';
		if (a === b) return 'same';
		if (a === 'PASS' && b === 'FAIL') return 'regression';
		if (a === 'FAIL' && b === 'PASS') return 'improvement';
		return 'changed';
	}

	const kindLabel: Record<Kind, () => string> = {
		same: m.tr_compare_same,
		regression: m.tr_compare_regression,
		improvement: m.tr_compare_improvement,
		changed: m.tr_compare_changed,
		onlyA: m.tr_compare_only_a,
		onlyB: m.tr_compare_only_b
	};
	const kindGlyph: Record<Kind, string> = {
		same: '=',
		regression: '▼',
		improvement: '▲',
		changed: '◆',
		onlyA: 'A',
		onlyB: 'B'
	};
	const kindTone: Record<Kind, string> = {
		same: 'text-muted-foreground',
		regression: 'text-red-700 dark:text-red-400',
		improvement: 'text-green-700 dark:text-green-400',
		changed: 'text-amber-700 dark:text-amber-400',
		onlyA: 'text-muted-foreground',
		onlyB: 'text-muted-foreground'
	};
	const kindTint: Record<Kind, string> = {
		same: '',
		regression: 'bg-red-50 dark:bg-red-950/20',
		improvement: 'bg-green-50 dark:bg-green-950/20',
		changed: 'bg-yellow-50 dark:bg-yellow-950/20',
		onlyA: '',
		onlyB: ''
	};

	const diffCount = $derived(
		data.rows.filter((r) => kindOf(r.statusA, r.statusB) !== 'same').length
	);

	const filteredRows = $derived.by(() => {
		if (filter === 'regression')
			return data.rows.filter((r) => kindOf(r.statusA, r.statusB) === 'regression');
		if (filter === 'diff') return data.rows.filter((r) => kindOf(r.statusA, r.statusB) !== 'same');
		return data.rows;
	});

	function exportCsv() {
		const headers = [
			m.compare_csv_key(),
			m.compare_csv_title(),
			m.compare_csv_priority(),
			m.compare_csv_run_a_status(),
			m.compare_csv_run_b_status(),
			m.tr_compare_change()
		];
		const rows = filteredRows.map((r) => [
			r.key,
			r.title,
			r.priority,
			r.statusA ?? '-',
			r.statusB ?? '-',
			kindLabel[kindOf(r.statusA, r.statusB)]()
		]);
		// formatCsvRow quotes every cell and neutralizes spreadsheet formulas in titles.
		const csv = '﻿' + [formatCsvRow(headers), ...rows.map(formatCsvRow)].join('\n');
		const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `compare-${data.runA.name}-vs-${data.runB.name}.csv`.replace(
			/[\\/:*?"<>|]+/g,
			'-'
		);
		a.click();
		URL.revokeObjectURL(url);
	}

	function statusVariant(s: string | null): 'default' | 'secondary' | 'outline' | 'destructive' {
		switch (s) {
			case 'PASS':
				return 'default';
			case 'FAIL':
				return 'destructive';
			case 'BLOCKED':
				return 'secondary';
			default:
				return 'outline';
		}
	}

	function getPriorityColor(name: string): string {
		return (
			(data.projectPriorities as ProjectPriority[]).find((p) => p.name === name)?.color ?? '#6b7280'
		);
	}

	const runHref = (id: number) => `/projects/${data.project.id}/test-runs/${id}`;
	const caseHref = (row: Row) => `/projects/${data.project.id}/test-cases/${row.testCaseId}`;

	const stats = $derived([
		{ label: m.tr_compare_same(), value: data.summary.same, glyph: '', tone: '' },
		{
			label: m.tr_compare_regression(),
			value: data.summary.regression,
			glyph: '▼',
			tone: kindTone.regression
		},
		{
			label: m.tr_compare_improvement(),
			value: data.summary.improvement,
			glyph: '▲',
			tone: kindTone.improvement
		},
		{
			label: m.tr_compare_changed(),
			value: data.summary.changed,
			glyph: '◆',
			tone: kindTone.changed
		},
		{ label: m.tr_compare_only_a(), value: data.summary.onlyInA, glyph: '', tone: '' },
		{ label: m.tr_compare_only_b(), value: data.summary.onlyInB, glyph: '', tone: '' }
	]);
</script>

{#snippet statusCell(status: string | null)}
	{#if status}
		<Badge variant={statusVariant(status)} class="px-1.5 py-0 text-xs"
			>{executionStatusLabel(status)}</Badge
		>
	{:else}
		<span aria-hidden="true" class="text-muted-foreground">—</span>
		<span class="sr-only">{m.tr_compare_not_in_run()}</span>
	{/if}
{/snippet}

{#snippet change(row: Row)}
	{@const kind = kindOf(row.statusA, row.statusB)}
	<span class="inline-flex items-center gap-1 text-xs font-medium {kindTone[kind]}">
		<span aria-hidden="true">{kindGlyph[kind]}</span>
		{kindLabel[kind]()}
	</span>
{/snippet}

<div class="space-y-4">
	<div class="flex flex-col gap-2 sm:flex-row sm:items-center">
		<Button
			variant="outline"
			size="sm"
			href="/projects/{data.project.id}/test-runs"
			class="min-h-10 w-full sm:w-auto sm:self-start"
		>
			<ArrowLeftIcon class="size-4" aria-hidden="true" />
			{m.common_back_to({ target: m.tr_title() })}
		</Button>
		<h2 class="text-lg font-semibold">{m.tr_compare_title()}</h2>
	</div>

	<!-- Run headers -->
	<div class="grid gap-3 sm:grid-cols-2 sm:gap-4">
		{#each [{ label: m.compare_run_a(), run: data.runA }, { label: m.compare_run_b(), run: data.runB }] as { label, run } (label)}
			<Card.Root>
				<Card.Content class="p-4">
					<div class="mb-1 text-xs text-muted-foreground">{label}</div>
					<a href={runHref(run.id)} class="font-medium [overflow-wrap:anywhere] hover:underline"
						>{run.name}</a
					>
					<div><Badge variant="outline" class="mt-1 text-xs">{run.environment}</Badge></div>
				</Card.Content>
			</Card.Root>
		{/each}
	</div>

	<!-- Summary stats -->
	<dl class="grid grid-cols-2 gap-2 min-[420px]:grid-cols-3 sm:grid-cols-6">
		{#each stats as stat (stat.label)}
			<!-- dl > div > dt + dd is the valid grouping; a Card would put extra wrappers in between. -->
			<div class="flex flex-col-reverse rounded-xl border bg-card p-3 text-center shadow-sm">
				<dt class="text-xs text-muted-foreground">{stat.label}</dt>
				<dd class="text-xl font-bold {stat.tone}">
					{#if stat.glyph}<span aria-hidden="true">{stat.glyph} </span>{/if}{stat.value}
				</dd>
			</div>
		{/each}
	</dl>

	<!-- Filters -->
	<div class="grid grid-cols-1 gap-1 min-[420px]:grid-cols-2 sm:flex sm:flex-wrap sm:items-center">
		<div
			role="group"
			aria-label={m.tr_compare_filter_group()}
			class="contents sm:flex sm:flex-wrap sm:gap-1"
		>
			<Button
				variant={filter === 'all' ? 'default' : 'outline'}
				size="sm"
				aria-pressed={filter === 'all'}
				class="min-h-10 w-full px-3 text-xs sm:w-auto"
				onclick={() => (filter = 'all')}
			>
				{m.tr_compare_filter_all()} ({data.rows.length})
			</Button>
			<Button
				variant={filter === 'diff' ? 'default' : 'outline'}
				size="sm"
				aria-pressed={filter === 'diff'}
				class="min-h-10 w-full px-3 text-xs sm:w-auto"
				onclick={() => (filter = 'diff')}
			>
				{m.tr_compare_filter_diff()} ({diffCount})
			</Button>
			<Button
				variant={filter === 'regression' ? 'default' : 'outline'}
				size="sm"
				aria-pressed={filter === 'regression'}
				class="min-h-10 w-full px-3 text-xs sm:w-auto"
				onclick={() => (filter = 'regression')}
			>
				{m.tr_compare_filter_regression()} ({data.summary.regression})
			</Button>
		</div>
		<div class="min-[420px]:col-span-2 sm:ml-auto sm:w-auto">
			<Button
				variant="outline"
				size="sm"
				class="min-h-10 w-full px-3 text-xs sm:w-auto"
				disabled={filteredRows.length === 0}
				onclick={exportCsv}
			>
				{m.run_export_csv()}
			</Button>
		</div>
	</div>
	<p role="status" class="text-xs text-muted-foreground">
		{m.tr_compare_showing({ count: filteredRows.length })}
	</p>

	<!-- Comparison -->
	{#if filteredRows.length === 0}
		<div
			class="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center"
		>
			<p class="text-sm text-muted-foreground">
				{data.rows.length === 0 ? m.tr_compare_no_rows() : m.tr_compare_no_diff()}
			</p>
		</div>
	{:else}
		<ul class="space-y-2 sm:hidden" aria-label={m.tr_compare_title()}>
			{#each filteredRows as row (row.testCaseId)}
				<li class="rounded-md border p-3 {kindTint[kindOf(row.statusA, row.statusB)]}">
					<div class="flex items-start justify-between gap-3">
						<div class="min-w-0 flex-1">
							<p class="font-mono text-xs text-muted-foreground">{row.key}</p>
							<a
								href={caseHref(row)}
								class="mt-1 block text-sm font-medium [overflow-wrap:anywhere] hover:underline"
								>{row.title}</a
							>
						</div>
						<span class="shrink-0">
							<PriorityBadge name={row.priority} color={getPriorityColor(row.priority)} />
						</span>
					</div>
					<div class="mt-2">{@render change(row)}</div>
					<div class="mt-3 grid grid-cols-2 gap-2 text-xs">
						<div class="rounded border bg-background/70 p-2">
							<div class="mb-1 text-muted-foreground">{m.compare_run_a()}</div>
							{@render statusCell(row.statusA)}
						</div>
						<div class="rounded border bg-background/70 p-2">
							<div class="mb-1 text-muted-foreground">{m.compare_run_b()}</div>
							{@render statusCell(row.statusB)}
						</div>
					</div>
				</li>
			{/each}
		</ul>

		<div class="hidden overflow-hidden rounded-md border sm:block">
			<Table.Root aria-label={m.tr_compare_title()}>
				<Table.Header>
					<Table.Row>
						<Table.Head class="w-24 px-2 py-1 text-xs">{m.common_key()}</Table.Head>
						<Table.Head class="px-2 py-1 text-xs">{m.common_title()}</Table.Head>
						<Table.Head class="w-24 px-2 py-1 text-xs">{m.common_priority()}</Table.Head>
						<Table.Head class="w-24 px-2 py-1 text-xs">{m.compare_run_a()}</Table.Head>
						<Table.Head class="w-24 px-2 py-1 text-xs">{m.compare_run_b()}</Table.Head>
						<Table.Head class="w-32 px-2 py-1 text-xs">{m.tr_compare_change()}</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each filteredRows as row (row.testCaseId)}
						<Table.Row class={kindTint[kindOf(row.statusA, row.statusB)]}>
							<Table.Cell class="px-2 py-1 font-mono text-xs">{row.key}</Table.Cell>
							<Table.Cell class="px-2 py-1 text-xs whitespace-normal [overflow-wrap:anywhere]">
								<a href={caseHref(row)} class="hover:underline">{row.title}</a>
							</Table.Cell>
							<Table.Cell class="px-2 py-1">
								<PriorityBadge name={row.priority} color={getPriorityColor(row.priority)} />
							</Table.Cell>
							<Table.Cell class="px-2 py-1">{@render statusCell(row.statusA)}</Table.Cell>
							<Table.Cell class="px-2 py-1">{@render statusCell(row.statusB)}</Table.Cell>
							<Table.Cell class="px-2 py-1">{@render change(row)}</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</div>
	{/if}
</div>
