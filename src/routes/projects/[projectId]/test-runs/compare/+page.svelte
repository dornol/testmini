<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';

	let { data } = $props();

	let filter = $state<'all' | 'diff' | 'regression'>('all');

	const filteredRows = $derived.by(() => {
		if (filter === 'all') return data.rows;
		if (filter === 'regression') {
			return data.rows.filter((r) => r.statusA === 'PASS' && r.statusB === 'FAIL');
		}
		return data.rows.filter((r) => r.statusA !== r.statusB);
	});

	function statusVariant(s: string | null): 'default' | 'secondary' | 'outline' | 'destructive' {
		switch (s) {
			case 'PASS': return 'default';
			case 'FAIL': return 'destructive';
			case 'BLOCKED': return 'secondary';
			default: return 'outline';
		}
	}

	function priorityVariant(p: string): 'default' | 'secondary' | 'outline' | 'destructive' {
		switch (p) {
			case 'CRITICAL': return 'destructive';
			case 'HIGH': return 'default';
			case 'MEDIUM': return 'secondary';
			default: return 'outline';
		}
	}

	function rowHighlight(statusA: string | null, statusB: string | null): string {
		if (statusA === null || statusB === null) return '';
		if (statusA === statusB) return '';
		if (statusA === 'PASS' && statusB === 'FAIL') return 'bg-red-50 dark:bg-red-950/20';
		if (statusA === 'FAIL' && statusB === 'PASS') return 'bg-green-50 dark:bg-green-950/20';
		return 'bg-yellow-50 dark:bg-yellow-950/20';
	}
</script>

<div class="space-y-4">
	<div class="flex items-center gap-2">
		<Button variant="outline" size="sm" href="/projects/{data.project.id}/test-runs" class="h-7 text-xs">
			&larr; {m.common_back_to({ target: m.tr_title() })}
		</Button>
		<h2 class="text-lg font-semibold">{m.tr_compare_title()}</h2>
	</div>

	<!-- Run headers -->
	<div class="grid grid-cols-2 gap-4">
		<Card.Root>
			<Card.Content class="p-4">
				<div class="text-xs text-muted-foreground mb-1">Run A</div>
				<div class="font-medium">{data.runA.name}</div>
				<Badge variant="outline" class="mt-1 text-[10px]">{data.runA.environment}</Badge>
			</Card.Content>
		</Card.Root>
		<Card.Root>
			<Card.Content class="p-4">
				<div class="text-xs text-muted-foreground mb-1">Run B</div>
				<div class="font-medium">{data.runB.name}</div>
				<Badge variant="outline" class="mt-1 text-[10px]">{data.runB.environment}</Badge>
			</Card.Content>
		</Card.Root>
	</div>

	<!-- Summary stats -->
	<div class="grid grid-cols-3 gap-2 sm:grid-cols-6">
		<Card.Root>
			<Card.Content class="p-3 text-center">
				<div class="text-xl font-bold">{data.summary.same}</div>
				<div class="text-[10px] text-muted-foreground">{m.tr_compare_same()}</div>
			</Card.Content>
		</Card.Root>
		<Card.Root>
			<Card.Content class="p-3 text-center">
				<div class="text-xl font-bold text-red-600">{data.summary.regression}</div>
				<div class="text-[10px] text-muted-foreground">{m.tr_compare_regression()}</div>
			</Card.Content>
		</Card.Root>
		<Card.Root>
			<Card.Content class="p-3 text-center">
				<div class="text-xl font-bold text-green-600">{data.summary.improvement}</div>
				<div class="text-[10px] text-muted-foreground">{m.tr_compare_improvement()}</div>
			</Card.Content>
		</Card.Root>
		<Card.Root>
			<Card.Content class="p-3 text-center">
				<div class="text-xl font-bold text-yellow-600">{data.summary.changed}</div>
				<div class="text-[10px] text-muted-foreground">{m.tr_compare_changed()}</div>
			</Card.Content>
		</Card.Root>
		<Card.Root>
			<Card.Content class="p-3 text-center">
				<div class="text-xl font-bold">{data.summary.onlyInA}</div>
				<div class="text-[10px] text-muted-foreground">{m.tr_compare_only_a()}</div>
			</Card.Content>
		</Card.Root>
		<Card.Root>
			<Card.Content class="p-3 text-center">
				<div class="text-xl font-bold">{data.summary.onlyInB}</div>
				<div class="text-[10px] text-muted-foreground">{m.tr_compare_only_b()}</div>
			</Card.Content>
		</Card.Root>
	</div>

	<!-- Filter tabs -->
	<div class="flex gap-1">
		<Button variant={filter === 'all' ? 'default' : 'outline'} size="sm" class="h-7 px-2 text-xs" onclick={() => (filter = 'all')}>
			{m.tr_compare_filter_all()} ({data.rows.length})
		</Button>
		<Button variant={filter === 'diff' ? 'default' : 'outline'} size="sm" class="h-7 px-2 text-xs" onclick={() => (filter = 'diff')}>
			{m.tr_compare_filter_diff()} ({data.rows.filter((r) => r.statusA !== r.statusB).length})
		</Button>
		<Button variant={filter === 'regression' ? 'default' : 'outline'} size="sm" class="h-7 px-2 text-xs" onclick={() => (filter = 'regression')}>
			{m.tr_compare_filter_regression()} ({data.summary.regression})
		</Button>
	</div>

	<!-- Comparison table -->
	{#if filteredRows.length === 0}
		<div class="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
			<p class="text-muted-foreground text-sm">{m.tr_compare_no_diff()}</p>
		</div>
	{:else}
		<div class="border rounded-md overflow-hidden">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head class="py-1 px-2 text-xs w-24">{m.common_key()}</Table.Head>
						<Table.Head class="py-1 px-2 text-xs">{m.common_title()}</Table.Head>
						<Table.Head class="py-1 px-2 text-xs w-20">{m.common_priority()}</Table.Head>
						<Table.Head class="py-1 px-2 text-xs w-24">Run A</Table.Head>
						<Table.Head class="py-1 px-2 text-xs w-24">Run B</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each filteredRows as row (row.testCaseId)}
						<Table.Row class={rowHighlight(row.statusA, row.statusB)}>
							<Table.Cell class="py-1 px-2 text-xs font-mono">{row.key}</Table.Cell>
							<Table.Cell class="py-1 px-2 text-xs">{row.title}</Table.Cell>
							<Table.Cell class="py-1 px-2">
								<Badge variant={priorityVariant(row.priority)} class="text-[10px] px-1.5 py-0">{row.priority}</Badge>
							</Table.Cell>
							<Table.Cell class="py-1 px-2">
								{#if row.statusA}
									<Badge variant={statusVariant(row.statusA)} class="text-[10px] px-1.5 py-0">{row.statusA}</Badge>
								{:else}
									<span class="text-muted-foreground text-[10px]">-</span>
								{/if}
							</Table.Cell>
							<Table.Cell class="py-1 px-2">
								{#if row.statusB}
									<Badge variant={statusVariant(row.statusB)} class="text-[10px] px-1.5 py-0">{row.statusB}</Badge>
								{:else}
									<span class="text-muted-foreground text-[10px]">-</span>
								{/if}
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</div>
	{/if}
</div>
