<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';

	let { data } = $props();
	const proj = $derived(data.project);
	const stats = $derived(data.stats);
	const recentRuns = $derived(data.recentRuns);

	const passRate = $derived(
		stats.execCounts.total > 0
			? Math.round((stats.execCounts.pass / stats.execCounts.total) * 100)
			: 0
	);

	const executed = $derived(stats.execCounts.total - stats.execCounts.pending);

	function statusVariant(s: string): 'default' | 'secondary' | 'outline' | 'destructive' {
		switch (s) {
			case 'COMPLETED':
				return 'default';
			case 'IN_PROGRESS':
				return 'secondary';
			default:
				return 'outline';
		}
	}
</script>

<!-- Summary Cards -->
<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
	<Card.Root>
		<Card.Header class="pb-2">
			<Card.Title class="text-muted-foreground text-sm font-medium">{m.dashboard_test_cases()}</Card.Title>
		</Card.Header>
		<Card.Content>
			<p class="text-2xl font-bold">{stats.testCaseCount}</p>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header class="pb-2">
			<Card.Title class="text-muted-foreground text-sm font-medium">{m.dashboard_test_runs()}</Card.Title>
		</Card.Header>
		<Card.Content>
			<p class="text-2xl font-bold">{stats.runCounts.total}</p>
			<div class="text-muted-foreground mt-1 flex gap-2 text-xs">
				{#if stats.runCounts.inProgress > 0}
					<span class="text-blue-600">{m.dashboard_in_progress({ count: stats.runCounts.inProgress })}</span>
				{/if}
				{#if stats.runCounts.completed > 0}
					<span class="text-green-600">{m.dashboard_completed({ count: stats.runCounts.completed })}</span>
				{/if}
			</div>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header class="pb-2">
			<Card.Title class="text-muted-foreground text-sm font-medium">{m.dashboard_pass_rate()}</Card.Title>
		</Card.Header>
		<Card.Content>
			<p class="text-2xl font-bold {passRate >= 80 ? 'text-green-600' : passRate >= 50 ? 'text-yellow-600' : stats.execCounts.total === 0 ? '' : 'text-red-600'}">
				{stats.execCounts.total > 0 ? `${passRate}%` : '-'}
			</p>
			{#if stats.execCounts.total > 0}
				<p class="text-muted-foreground mt-1 text-xs">
					{m.dashboard_executed({ pass: stats.execCounts.pass, executed })}
				</p>
			{/if}
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header class="pb-2">
			<Card.Title class="text-muted-foreground text-sm font-medium">{m.dashboard_members()}</Card.Title>
		</Card.Header>
		<Card.Content>
			<p class="text-2xl font-bold">{proj.memberCount}</p>
			<p class="text-muted-foreground mt-1 text-xs">
				{proj.active ? m.common_active() : m.common_inactive()} &middot; {new Date(proj.createdAt).toLocaleDateString()}
			</p>
		</Card.Content>
	</Card.Root>
</div>

<!-- Execution Breakdown -->
{#if stats.execCounts.total > 0}
	<Card.Root class="mt-6">
		<Card.Header>
			<Card.Title class="text-sm font-medium">{m.dashboard_exec_summary()}</Card.Title>
		</Card.Header>
		<Card.Content>
			<div class="space-y-3">
				<div class="bg-secondary flex h-3 overflow-hidden rounded-full">
					{#if stats.execCounts.pass > 0}
						<div
							class="bg-green-500 transition-all"
							style="width: {(stats.execCounts.pass / stats.execCounts.total) * 100}%"
						></div>
					{/if}
					{#if stats.execCounts.fail > 0}
						<div
							class="bg-red-500 transition-all"
							style="width: {(stats.execCounts.fail / stats.execCounts.total) * 100}%"
						></div>
					{/if}
					{#if stats.execCounts.blocked > 0}
						<div
							class="bg-orange-500 transition-all"
							style="width: {(stats.execCounts.blocked / stats.execCounts.total) * 100}%"
						></div>
					{/if}
					{#if stats.execCounts.skipped > 0}
						<div
							class="bg-gray-400 transition-all"
							style="width: {(stats.execCounts.skipped / stats.execCounts.total) * 100}%"
						></div>
					{/if}
				</div>
				<div class="flex flex-wrap gap-4 text-sm">
					<span class="flex items-center gap-1">
						<span class="inline-block h-3 w-3 rounded-full bg-green-500"></span>
						{m.dashboard_pass()}: {stats.execCounts.pass}
					</span>
					<span class="flex items-center gap-1">
						<span class="inline-block h-3 w-3 rounded-full bg-red-500"></span>
						{m.dashboard_fail()}: {stats.execCounts.fail}
					</span>
					<span class="flex items-center gap-1">
						<span class="inline-block h-3 w-3 rounded-full bg-orange-500"></span>
						{m.dashboard_blocked()}: {stats.execCounts.blocked}
					</span>
					<span class="flex items-center gap-1">
						<span class="inline-block h-3 w-3 rounded-full bg-gray-400"></span>
						{m.dashboard_skipped()}: {stats.execCounts.skipped}
					</span>
					<span class="flex items-center gap-1">
						<span class="bg-secondary inline-block h-3 w-3 rounded-full border"></span>
						{m.dashboard_pending()}: {stats.execCounts.pending}
					</span>
				</div>
			</div>
		</Card.Content>
	</Card.Root>
{/if}

<!-- Recent Test Runs -->
{#if recentRuns.length > 0}
	<Card.Root class="mt-6">
		<Card.Header>
			<div class="flex items-center justify-between">
				<Card.Title class="text-sm font-medium">{m.dashboard_recent_runs()}</Card.Title>
				<a
					href="/projects/{proj.id}/test-runs"
					class="text-muted-foreground hover:text-foreground text-xs"
				>
					{m.dashboard_view_all()} &rarr;
				</a>
			</div>
		</Card.Header>
		<Card.Content class="p-0">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>{m.common_name()}</Table.Head>
						<Table.Head class="w-24">{m.dashboard_env()}</Table.Head>
						<Table.Head class="w-28">{m.common_status()}</Table.Head>
						<Table.Head class="w-40">{m.dashboard_result()}</Table.Head>
						<Table.Head class="w-28">{m.common_date()}</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each recentRuns as run (run.id)}
						{@const runPassRate = run.totalCount > 0 ? Math.round((run.passCount / run.totalCount) * 100) : 0}
						<Table.Row
							class="cursor-pointer"
							onclick={() => { window.location.href = `/projects/${proj.id}/test-runs/${run.id}`; }}
						>
							<Table.Cell class="font-medium">{run.name}</Table.Cell>
							<Table.Cell>
								<Badge variant="outline">{run.environment}</Badge>
							</Table.Cell>
							<Table.Cell>
								<Badge variant={statusVariant(run.status)}>
									{run.status.replace('_', ' ')}
								</Badge>
							</Table.Cell>
							<Table.Cell>
								<div class="flex items-center gap-2">
									<div class="bg-secondary flex h-2 w-20 overflow-hidden rounded-full">
										{#if run.passCount > 0}
											<div
												class="bg-green-500"
												style="width: {(run.passCount / run.totalCount) * 100}%"
											></div>
										{/if}
										{#if run.failCount > 0}
											<div
												class="bg-red-500"
												style="width: {(run.failCount / run.totalCount) * 100}%"
											></div>
										{/if}
									</div>
									<span class="text-muted-foreground text-xs">{runPassRate}%</span>
								</div>
							</Table.Cell>
							<Table.Cell class="text-muted-foreground text-xs">
								{new Date(run.createdAt).toLocaleDateString()}
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</Card.Content>
	</Card.Root>
{/if}

<!-- Description -->
{#if proj.description}
	<Card.Root class="mt-6">
		<Card.Header>
			<Card.Title class="text-sm font-medium">{m.common_description()}</Card.Title>
		</Card.Header>
		<Card.Content>
			<p class="text-muted-foreground whitespace-pre-wrap">{proj.description}</p>
		</Card.Content>
	</Card.Root>
{/if}
