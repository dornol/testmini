<script lang="ts">
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
			<Card.Title class="text-muted-foreground text-sm font-medium">Test Cases</Card.Title>
		</Card.Header>
		<Card.Content>
			<p class="text-2xl font-bold">{stats.testCaseCount}</p>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header class="pb-2">
			<Card.Title class="text-muted-foreground text-sm font-medium">Test Runs</Card.Title>
		</Card.Header>
		<Card.Content>
			<p class="text-2xl font-bold">{stats.runCounts.total}</p>
			<div class="text-muted-foreground mt-1 flex gap-2 text-xs">
				{#if stats.runCounts.inProgress > 0}
					<span class="text-blue-600">{stats.runCounts.inProgress} in progress</span>
				{/if}
				{#if stats.runCounts.completed > 0}
					<span class="text-green-600">{stats.runCounts.completed} completed</span>
				{/if}
			</div>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header class="pb-2">
			<Card.Title class="text-muted-foreground text-sm font-medium">Pass Rate</Card.Title>
		</Card.Header>
		<Card.Content>
			<p class="text-2xl font-bold {passRate >= 80 ? 'text-green-600' : passRate >= 50 ? 'text-yellow-600' : stats.execCounts.total === 0 ? '' : 'text-red-600'}">
				{stats.execCounts.total > 0 ? `${passRate}%` : '-'}
			</p>
			{#if stats.execCounts.total > 0}
				<p class="text-muted-foreground mt-1 text-xs">
					{stats.execCounts.pass} / {executed} executed
				</p>
			{/if}
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header class="pb-2">
			<Card.Title class="text-muted-foreground text-sm font-medium">Members</Card.Title>
		</Card.Header>
		<Card.Content>
			<p class="text-2xl font-bold">{proj.memberCount}</p>
			<p class="text-muted-foreground mt-1 text-xs">
				{proj.active ? 'Active' : 'Inactive'} &middot; {new Date(proj.createdAt).toLocaleDateString()}
			</p>
		</Card.Content>
	</Card.Root>
</div>

<!-- Execution Breakdown -->
{#if stats.execCounts.total > 0}
	<Card.Root class="mt-6">
		<Card.Header>
			<Card.Title class="text-sm font-medium">Execution Summary</Card.Title>
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
						Pass: {stats.execCounts.pass}
					</span>
					<span class="flex items-center gap-1">
						<span class="inline-block h-3 w-3 rounded-full bg-red-500"></span>
						Fail: {stats.execCounts.fail}
					</span>
					<span class="flex items-center gap-1">
						<span class="inline-block h-3 w-3 rounded-full bg-orange-500"></span>
						Blocked: {stats.execCounts.blocked}
					</span>
					<span class="flex items-center gap-1">
						<span class="inline-block h-3 w-3 rounded-full bg-gray-400"></span>
						Skipped: {stats.execCounts.skipped}
					</span>
					<span class="flex items-center gap-1">
						<span class="bg-secondary inline-block h-3 w-3 rounded-full border"></span>
						Pending: {stats.execCounts.pending}
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
				<Card.Title class="text-sm font-medium">Recent Test Runs</Card.Title>
				<a
					href="/projects/{proj.id}/test-runs"
					class="text-muted-foreground hover:text-foreground text-xs"
				>
					View all &rarr;
				</a>
			</div>
		</Card.Header>
		<Card.Content class="p-0">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>Name</Table.Head>
						<Table.Head class="w-24">Env</Table.Head>
						<Table.Head class="w-28">Status</Table.Head>
						<Table.Head class="w-40">Result</Table.Head>
						<Table.Head class="w-28">Date</Table.Head>
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
			<Card.Title class="text-sm font-medium">Description</Card.Title>
		</Card.Header>
		<Card.Content>
			<p class="text-muted-foreground whitespace-pre-wrap">{proj.description}</p>
		</Card.Content>
	</Card.Root>
{/if}
