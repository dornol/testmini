<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';

	let { data } = $props();

	let selectedPending = $state<Set<number>>(new Set());

	const run = $derived(data.run);
	const stats = $derived(data.stats);
	const canExecute = $derived(data.userRole !== 'VIEWER');
	const basePath = $derived(`/projects/${data.project.id}/test-runs`);

	const completedPct = $derived(
		stats.total > 0 ? Math.round(((stats.total - stats.pending) / stats.total) * 100) : 0
	);

	const pendingExecutions = $derived(data.executions.filter((e) => e.status === 'PENDING'));

	const allPendingSelected = $derived(
		pendingExecutions.length > 0 && pendingExecutions.every((e) => selectedPending.has(e.id))
	);

	function togglePendingAll() {
		if (allPendingSelected) {
			selectedPending = new Set();
		} else {
			selectedPending = new Set(pendingExecutions.map((e) => e.id));
		}
	}

	function togglePending(id: number) {
		const newSet = new Set(selectedPending);
		if (newSet.has(id)) {
			newSet.delete(id);
		} else {
			newSet.add(id);
		}
		selectedPending = newSet;
	}

	function statusColor(s: string): string {
		switch (s) {
			case 'PASS':
				return 'text-green-600 bg-green-50 dark:bg-green-950 dark:text-green-400';
			case 'FAIL':
				return 'text-red-600 bg-red-50 dark:bg-red-950 dark:text-red-400';
			case 'BLOCKED':
				return 'text-orange-600 bg-orange-50 dark:bg-orange-950 dark:text-orange-400';
			case 'SKIPPED':
				return 'text-gray-600 bg-gray-50 dark:bg-gray-800 dark:text-gray-400';
			default:
				return 'text-muted-foreground';
		}
	}

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

	function handleResult() {
		return async ({ result, update }: { result: { type: string; data?: Record<string, unknown> }; update: () => Promise<void> }) => {
			if (result.type === 'success') {
				selectedPending = new Set();
				await invalidateAll();
			} else if (result.type === 'failure') {
				toast.error((result.data?.error as string) ?? 'Operation failed');
				await update();
			}
		};
	}
</script>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<div>
			<a href={basePath} class="text-muted-foreground hover:text-foreground text-sm"
				>&larr; Back to Test Runs</a
			>
			<div class="mt-1 flex items-center gap-3">
				<h2 class="text-xl font-bold">{run.name}</h2>
				<Badge variant="outline">{run.environment}</Badge>
				<Badge variant={statusVariant(run.status)}>{run.status.replace('_', ' ')}</Badge>
			</div>
		</div>
		{#if canExecute && run.status !== 'COMPLETED'}
			<div class="flex gap-2">
				{#if run.status === 'CREATED'}
					<form method="POST" action="?/updateRunStatus" use:enhance={handleResult}>
						<input type="hidden" name="status" value="IN_PROGRESS" />
						<Button type="submit" size="sm">Start Run</Button>
					</form>
				{/if}
				{#if run.status === 'IN_PROGRESS'}
					<form method="POST" action="?/updateRunStatus" use:enhance={handleResult}>
						<input type="hidden" name="status" value="COMPLETED" />
						<Button type="submit" variant="outline" size="sm">Complete Run</Button>
					</form>
				{/if}
			</div>
		{/if}
	</div>

	<!-- Progress Stats -->
	<Card.Root>
		<Card.Content class="pt-6">
			<div class="space-y-3">
				<div class="flex items-center justify-between text-sm">
					<span class="font-medium">Progress</span>
					<span class="text-muted-foreground">{completedPct}% complete</span>
				</div>
				<div class="bg-secondary flex h-3 overflow-hidden rounded-full">
					{#if stats.pass > 0}
						<div
							class="bg-green-500 transition-all"
							style="width: {(stats.pass / stats.total) * 100}%"
						></div>
					{/if}
					{#if stats.fail > 0}
						<div
							class="bg-red-500 transition-all"
							style="width: {(stats.fail / stats.total) * 100}%"
						></div>
					{/if}
					{#if stats.blocked > 0}
						<div
							class="bg-orange-500 transition-all"
							style="width: {(stats.blocked / stats.total) * 100}%"
						></div>
					{/if}
					{#if stats.skipped > 0}
						<div
							class="bg-gray-400 transition-all"
							style="width: {(stats.skipped / stats.total) * 100}%"
						></div>
					{/if}
				</div>
				<div class="flex flex-wrap gap-4 text-sm">
					<span class="flex items-center gap-1">
						<span class="inline-block h-3 w-3 rounded-full bg-green-500"></span>
						Pass: {stats.pass}
					</span>
					<span class="flex items-center gap-1">
						<span class="inline-block h-3 w-3 rounded-full bg-red-500"></span>
						Fail: {stats.fail}
					</span>
					<span class="flex items-center gap-1">
						<span class="inline-block h-3 w-3 rounded-full bg-orange-500"></span>
						Blocked: {stats.blocked}
					</span>
					<span class="flex items-center gap-1">
						<span class="inline-block h-3 w-3 rounded-full bg-gray-400"></span>
						Skipped: {stats.skipped}
					</span>
					<span class="flex items-center gap-1">
						<span class="bg-secondary inline-block h-3 w-3 rounded-full"></span>
						Pending: {stats.pending}
					</span>
				</div>
			</div>
		</Card.Content>
	</Card.Root>

	<!-- Bulk Actions -->
	{#if canExecute && selectedPending.size > 0}
		<div class="bg-muted flex items-center gap-3 rounded-lg p-3">
			<span class="text-sm font-medium">{selectedPending.size} pending selected</span>
			<form method="POST" action="?/bulkPass" use:enhance={handleResult}>
				{#each [...selectedPending] as id (id)}
					<input type="hidden" name="executionIds" value={id} />
				{/each}
				<Button type="submit" size="sm" variant="outline">Bulk Pass</Button>
			</form>
		</div>
	{/if}

	<!-- Executions Table -->
	<Card.Root>
		<Table.Root>
			<Table.Header>
				<Table.Row>
					{#if canExecute && pendingExecutions.length > 0}
						<Table.Head class="w-10">
							<input
								type="checkbox"
								checked={allPendingSelected}
								onchange={togglePendingAll}
								class="rounded"
							/>
						</Table.Head>
					{/if}
					<Table.Head class="w-28">Key</Table.Head>
					<Table.Head>Title</Table.Head>
					<Table.Head class="w-24">Priority</Table.Head>
					<Table.Head class="w-28">Status</Table.Head>
					{#if canExecute}
						<Table.Head class="w-52">Actions</Table.Head>
					{/if}
					<Table.Head class="w-32">Executed By</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each data.executions as exec (exec.id)}
					<Table.Row>
						{#if canExecute && pendingExecutions.length > 0}
							<Table.Cell>
								{#if exec.status === 'PENDING'}
									<input
										type="checkbox"
										checked={selectedPending.has(exec.id)}
										onchange={() => togglePending(exec.id)}
										class="rounded"
									/>
								{/if}
							</Table.Cell>
						{/if}
						<Table.Cell class="font-mono text-sm">{exec.testCaseKey}</Table.Cell>
						<Table.Cell class="font-medium">
							{exec.testCaseTitle}
							<span class="text-muted-foreground text-xs"> (v{exec.versionNo})</span>
						</Table.Cell>
						<Table.Cell>
							<Badge variant={priorityVariant(exec.testCasePriority)}>
								{exec.testCasePriority}
							</Badge>
						</Table.Cell>
						<Table.Cell>
							<span
								class="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium {statusColor(
									exec.status
								)}"
							>
								{exec.status}
							</span>
						</Table.Cell>
						{#if canExecute}
							<Table.Cell>
								{#if exec.status === 'PENDING' || run.status !== 'COMPLETED'}
									<div class="flex gap-1">
										{#each ['PASS', 'FAIL', 'BLOCKED', 'SKIPPED'] as s (s)}
											{#if exec.status !== s}
												<form
													method="POST"
													action="?/updateStatus"
													use:enhance={handleResult}
													class="inline"
												>
													<input type="hidden" name="executionId" value={exec.id} />
													<input type="hidden" name="status" value={s} />
													<Button
														type="submit"
														variant="ghost"
														size="sm"
														class="h-7 px-2 text-xs {s === 'PASS'
															? 'text-green-600 hover:text-green-700'
															: s === 'FAIL'
																? 'text-red-600 hover:text-red-700'
																: s === 'BLOCKED'
																	? 'text-orange-600 hover:text-orange-700'
																	: 'text-gray-600 hover:text-gray-700'}"
													>
														{s}
													</Button>
												</form>
											{/if}
										{/each}
									</div>
								{/if}
							</Table.Cell>
						{/if}
						<Table.Cell class="text-muted-foreground text-sm">
							{exec.executedBy ?? '-'}
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</Card.Root>
</div>
