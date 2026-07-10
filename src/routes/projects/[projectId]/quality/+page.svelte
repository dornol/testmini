<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { AlertTriangle, Bot, Boxes, ShieldCheck } from '@lucide/svelte';

	let { data } = $props();
	const pct = (value: number, total: number) => (total ? Math.round((value / total) * 100) : 0);
	const coveredModules = $derived(data.modules.filter((item) => item.testCaseCount > 0).length);
	const riskCount = (level: string) =>
		data.risk.find((item) => item.riskLevel === level)?.count ?? 0;
	const actionCount = $derived(
		data.modules.filter((item) => item.testCaseCount === 0).length +
			(data.totals.total - data.totals.assessed) +
			riskCount('CRITICAL') +
			riskCount('HIGH')
	);
</script>

<div class="space-y-5">
	<div>
		<h2 class="text-lg font-semibold">{m.quality_title()}</h2>
		<p class="text-muted-foreground text-sm">{m.quality_description()}</p>
	</div>

	<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
		<Card.Root
			><Card.Content class="flex items-center gap-3 p-4"
				><Boxes class="text-primary size-5" />
				<div>
					<p class="text-muted-foreground text-xs">{m.quality_module_coverage()}</p>
					<p class="text-xl font-semibold">{pct(coveredModules, data.modules.length)}%</p>
					<p class="text-muted-foreground text-xs">
						{coveredModules} / {data.modules.length}
						{m.quality_covered()}
					</p>
				</div></Card.Content
			></Card.Root
		>
		<Card.Root
			><Card.Content class="flex items-center gap-3 p-4"
				><ShieldCheck class="text-emerald-600 size-5" />
				<div>
					<p class="text-muted-foreground text-xs">{m.quality_risk_assessment()}</p>
					<p class="text-xl font-semibold">{pct(data.totals.assessed, data.totals.total)}%</p>
					<p class="text-muted-foreground text-xs">
						{data.totals.total - data.totals.assessed}
						{m.quality_unassessed()}
					</p>
				</div></Card.Content
			></Card.Root
		>
		<Card.Root
			><Card.Content class="flex items-center gap-3 p-4"
				><Bot class="text-sky-600 size-5" />
				<div>
					<p class="text-muted-foreground text-xs">{m.quality_automation_coverage()}</p>
					<p class="text-xl font-semibold">{pct(data.totals.automated, data.totals.total)}%</p>
					<p class="text-muted-foreground text-xs">
						{data.totals.automated} / {data.totals.total}
						{m.quality_automated()}
					</p>
				</div></Card.Content
			></Card.Root
		>
		<Card.Root
			><Card.Content class="flex items-center gap-3 p-4"
				><AlertTriangle class="text-amber-600 size-5" />
				<div>
					<p class="text-muted-foreground text-xs">{m.quality_action_required()}</p>
					<p class="text-xl font-semibold">{actionCount}</p>
					<p class="text-muted-foreground text-xs">
						High {riskCount('HIGH')} · Critical {riskCount('CRITICAL')}
					</p>
				</div></Card.Content
			></Card.Root
		>
	</div>

	<div class="grid gap-4 xl:grid-cols-2">
		<Card.Root
			><Card.Header
				><Card.Title class="text-base">{m.quality_module_coverage()}</Card.Title></Card.Header
			><Card.Content class="px-0"
				><div class="max-h-96 overflow-auto">
					<Table.Root
						><Table.Header
							><Table.Row
								><Table.Head class="pl-6">{m.quality_module()}</Table.Head><Table.Head
									class="text-right">{m.quality_cases()}</Table.Head
								><Table.Head class="pr-6 text-right">{m.quality_latest_result()}</Table.Head
								></Table.Row
							></Table.Header
						><Table.Body
							>{#each data.modules as item (item.id)}<Table.Row
									><Table.Cell class="pl-6 font-medium">{item.name}</Table.Cell><Table.Cell
										class="text-right">{item.testCaseCount}</Table.Cell
									><Table.Cell class="pr-6 text-right"
										><span class="text-emerald-600">{item.passCount}</span> /
										<span class="text-destructive">{item.failCount}</span></Table.Cell
									></Table.Row
								>{:else}<Table.Row
									><Table.Cell colspan={3} class="h-24 text-center text-muted-foreground"
										>{m.quality_no_modules()}</Table.Cell
									></Table.Row
								>{/each}</Table.Body
						></Table.Root
					>
				</div></Card.Content
			></Card.Root
		>
		<Card.Root
			><Card.Header
				><Card.Title class="text-base">{m.quality_recent_automation()}</Card.Title></Card.Header
			><Card.Content class="space-y-1 px-4 pb-4"
				>{#each data.recentAutomationRuns as run (run.id)}<a
						href={`/projects/${data.project.id}/test-runs/${run.id}`}
						class="hover:bg-muted flex min-w-0 items-center justify-between gap-3 rounded-md px-2 py-2"
						><div class="min-w-0">
							<p class="truncate text-sm font-medium">{run.name}</p>
							<p class="text-muted-foreground text-xs">
								{run.environment} · {new Date(run.createdAt).toLocaleDateString()}
							</p>
						</div>
						<div class="flex shrink-0 gap-1">
							<Badge variant="outline">{run.passed}/{run.total}</Badge>{#if run.failed > 0}<Badge
									variant="destructive">{run.failed} Fail</Badge
								>{/if}
						</div></a
					>{:else}<p class="text-muted-foreground py-12 text-center text-sm">
						{m.quality_no_automation_runs()}
					</p>{/each}</Card.Content
			></Card.Root
		>
	</div>
</div>
