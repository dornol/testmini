<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import * as Table from '$lib/components/ui/table/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import * as m from '$lib/paraglide/messages.js';

	let { data } = $props();

	let searchInput = $state('');
	let searchTimeout: ReturnType<typeof setTimeout>;

	$effect(() => {
		searchInput = data.search;
	});

	const basePath = $derived(`/projects/${data.project.id}/test-cases`);

	function handleSearch() {
		clearTimeout(searchTimeout);
		searchTimeout = setTimeout(() => {
			const params = new URLSearchParams(page.url.searchParams);
			if (searchInput) {
				params.set('search', searchInput);
			} else {
				params.delete('search');
			}
			params.set('page', '1');
			goto(`${basePath}?${params.toString()}`, { keepFocus: true });
		}, 300);
	}

	function setPriority(p: string) {
		const params = new URLSearchParams(page.url.searchParams);
		if (p) {
			params.set('priority', p);
		} else {
			params.delete('priority');
		}
		params.set('page', '1');
		goto(`${basePath}?${params.toString()}`);
	}

	function goToPage(p: number) {
		const params = new URLSearchParams(page.url.searchParams);
		params.set('page', String(p));
		goto(`${basePath}?${params.toString()}`);
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

	const priorities = ['', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<h2 class="text-lg font-semibold">{m.tc_title()}</h2>
		{#if data.userRole !== 'VIEWER'}
			<Button href="{basePath}/new">{m.tc_new()}</Button>
		{/if}
	</div>

	<div class="flex flex-wrap items-center gap-3">
		<Input
			placeholder={m.tc_search_placeholder()}
			class="max-w-sm"
			bind:value={searchInput}
			oninput={handleSearch}
		/>
		<div class="flex gap-1">
			{#each priorities as p (p)}
				<Button
					variant={data.priority === p ? 'default' : 'outline'}
					size="sm"
					onclick={() => setPriority(p)}
				>
					{p || m.common_all()}
				</Button>
			{/each}
		</div>
	</div>

	{#if data.testCases.length === 0}
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
				<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
				<path d="M14 2v6h6" />
				<path d="M16 13H8" />
				<path d="M16 17H8" />
				<path d="M10 9H8" />
			</svg>
			<h3 class="text-lg font-semibold">{m.tc_empty_title()}</h3>
			<p class="text-muted-foreground mt-1 text-sm">
				{#if data.search || data.priority}
					{m.tc_empty_search()}
				{:else}
					{m.tc_empty_create()}
				{/if}
			</p>
			{#if !data.search && !data.priority && data.userRole !== 'VIEWER'}
				<Button href="{basePath}/new" class="mt-4">{m.tc_create()}</Button>
			{/if}
		</div>
	{:else}
		<Card.Root>
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head class="w-28">{m.common_key()}</Table.Head>
						<Table.Head>{m.common_title()}</Table.Head>
						<Table.Head class="w-28">{m.common_priority()}</Table.Head>
						<Table.Head class="w-36">{m.tc_updated_by()}</Table.Head>
						<Table.Head class="w-40">{m.tc_updated_at()}</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.testCases as tc (tc.id)}
						<Table.Row
							class="cursor-pointer"
							onclick={() => goto(`${basePath}/${tc.id}`)}
						>
							<Table.Cell class="font-mono text-sm">{tc.key}</Table.Cell>
							<Table.Cell class="font-medium">{tc.title}</Table.Cell>
							<Table.Cell>
								<Badge variant={priorityVariant(tc.priority)}>{tc.priority}</Badge>
							</Table.Cell>
							<Table.Cell class="text-muted-foreground">{tc.updatedBy}</Table.Cell>
							<Table.Cell class="text-muted-foreground text-sm">
								{new Date(tc.updatedAt).toLocaleDateString()}
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
					{m.common_previous()}
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
					{m.common_next()}
				</Button>
			</div>
		{/if}
	{/if}
</div>
