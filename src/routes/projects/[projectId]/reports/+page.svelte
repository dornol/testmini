<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';

	let { data } = $props();

	const envStats = $derived(data.envStats);
	const recentRuns = $derived(data.recentRuns);
	const priorityStats = $derived(data.priorityStats);

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

<div class="space-y-6">
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
				<div class="flex items-end gap-1" style="height: 160px;">
					{#each recentRuns as run (run.id)}
						{@const rate = run.totalCount > 0 ? Math.round((run.passCount / run.totalCount) * 100) : 0}
						{@const barHeight = run.totalCount > 0 ? rate : 0}
						<div class="group relative flex flex-1 flex-col items-center">
							<div class="relative w-full" style="height: 140px;">
								<div
									class="absolute bottom-0 w-full rounded-t {rate >= 80 ? 'bg-green-500' : rate >= 50 ? 'bg-yellow-500' : 'bg-red-500'}"
									style="height: {barHeight}%;"
								></div>
							</div>
							<span class="mt-1 text-[10px] text-muted-foreground truncate w-full text-center">
								{run.name.length > 8 ? run.name.slice(0, 8) + '..' : run.name}
							</span>
							<!-- Tooltip -->
							<div class="pointer-events-none absolute -top-10 left-1/2 z-10 hidden -translate-x-1/2 rounded bg-popover px-2 py-1 text-xs shadow-md group-hover:block">
								<div class="font-medium">{run.name}</div>
								<div>{rate}% ({run.passCount}/{run.totalCount})</div>
								<div class="text-muted-foreground">{run.environment}</div>
							</div>
						</div>
					{/each}
				</div>
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

	<!-- Recent Completed Runs Table -->
	{#if recentRuns.length > 0}
		<Card.Root>
			<Card.Header>
				<Card.Title class="text-sm font-medium">{m.reports_recent_completed()}</Card.Title>
			</Card.Header>
			<Card.Content class="p-0">
				<Table.Root>
					<Table.Header>
						<Table.Row>
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
