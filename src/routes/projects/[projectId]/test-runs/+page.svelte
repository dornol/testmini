<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import * as Table from '$lib/components/ui/table/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';

	let { data } = $props();

	const basePath = $derived(`/projects/${data.project.id}/test-runs`);

	function setStatus(s: string) {
		const params = new URLSearchParams(page.url.searchParams);
		if (s) {
			params.set('status', s);
		} else {
			params.delete('status');
		}
		params.set('page', '1');
		goto(`${basePath}?${params.toString()}`);
	}

	function goToPage(p: number) {
		const params = new URLSearchParams(page.url.searchParams);
		params.set('page', String(p));
		goto(`${basePath}?${params.toString()}`);
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

	function progressPercent(passed: number, total: number): number {
		if (total === 0) return 0;
		return Math.round((passed / total) * 100);
	}

	const statuses = ['', 'CREATED', 'IN_PROGRESS', 'COMPLETED'];
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<h2 class="text-lg font-semibold">Test Runs</h2>
		{#if data.userRole !== 'VIEWER'}
			<Button href="{basePath}/new">New Test Run</Button>
		{/if}
	</div>

	<div class="flex gap-1">
		{#each statuses as s (s)}
			<Button
				variant={data.statusFilter === s ? 'default' : 'outline'}
				size="sm"
				onclick={() => setStatus(s)}
			>
				{s || 'All'}
			</Button>
		{/each}
	</div>

	{#if data.runs.length === 0}
		<div
			class="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="48"
				height="48"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="1.5"
				stroke-linecap="round"
				stroke-linejoin="round"
				class="text-muted-foreground mb-4"
			>
				<path d="M5 22h14" />
				<path d="M5 2h14" />
				<path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22" />
				<path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2" />
			</svg>
			<h3 class="text-lg font-semibold">No test runs found</h3>
			<p class="text-muted-foreground mt-1 text-sm">
				{#if data.statusFilter}
					No test runs match this filter.
				{:else}
					Create a test run to start executing test cases.
				{/if}
			</p>
			{#if !data.statusFilter && data.userRole !== 'VIEWER'}
				<Button href="{basePath}/new" class="mt-4">Create Test Run</Button>
			{/if}
		</div>
	{:else}
		<Card.Root>
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>Name</Table.Head>
						<Table.Head class="w-28">Environment</Table.Head>
						<Table.Head class="w-32">Status</Table.Head>
						<Table.Head class="w-40">Progress</Table.Head>
						<Table.Head class="w-32">Created By</Table.Head>
						<Table.Head class="w-36">Created At</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.runs as run (run.id)}
						{@const pct = progressPercent(run.passedCount, run.totalCount)}
						<Table.Row class="cursor-pointer" onclick={() => goto(`${basePath}/${run.id}`)}>
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
									<div class="bg-secondary h-2 w-full rounded-full">
										<div
											class="bg-primary h-2 rounded-full transition-all"
											style="width: {pct}%"
										></div>
									</div>
									<span class="text-muted-foreground w-12 text-right text-xs">
										{run.passedCount}/{run.totalCount}
									</span>
								</div>
							</Table.Cell>
							<Table.Cell class="text-muted-foreground">{run.createdBy}</Table.Cell>
							<Table.Cell class="text-muted-foreground text-sm">
								{new Date(run.createdAt).toLocaleDateString()}
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</Card.Root>

		{#if data.meta.totalPages > 1}
			<div class="flex items-center justify-center gap-2">
				<Button
					variant="outline"
					size="sm"
					disabled={data.meta.page <= 1}
					onclick={() => goToPage(data.meta.page - 1)}
				>
					Previous
				</Button>
				<span class="text-muted-foreground text-sm">
					Page {data.meta.page} of {data.meta.totalPages}
				</span>
				<Button
					variant="outline"
					size="sm"
					disabled={data.meta.page >= data.meta.totalPages}
					onclick={() => goToPage(data.meta.page + 1)}
				>
					Next
				</Button>
			</div>
		{/if}
	{/if}
</div>
