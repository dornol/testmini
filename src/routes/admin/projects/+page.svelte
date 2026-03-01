<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto, invalidateAll } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';

	let { data } = $props();

	let searchInput = $state('');
	$effect(() => {
		searchInput = data.search;
	});

	function doSearch() {
		const params = new URLSearchParams();
		if (searchInput) params.set('search', searchInput);
		if (data.showInactive) params.set('inactive', 'true');
		goto(`/admin/projects?${params.toString()}`);
	}

	function toggleInactive() {
		const params = new URLSearchParams();
		if (searchInput) params.set('search', searchInput);
		if (!data.showInactive) params.set('inactive', 'true');
		goto(`/admin/projects?${params.toString()}`);
	}

	function handleResult() {
		return async ({
			result,
			update
		}: {
			result: { type: string; data?: Record<string, unknown> };
			update: () => Promise<void>;
		}) => {
			if (result.type === 'success') {
				toast.success('Updated successfully');
				await invalidateAll();
			} else if (result.type === 'failure') {
				toast.error((result.data?.error as string) ?? 'Operation failed');
				await update();
			}
		};
	}
</script>

<div class="space-y-4">
	<!-- Search & Filters -->
	<div class="flex flex-wrap items-center gap-2">
		<form onsubmit={(e) => { e.preventDefault(); doSearch(); }} class="flex gap-2">
			<Input placeholder="Search projects..." class="max-w-sm" bind:value={searchInput} />
			<Button type="submit" variant="outline">Search</Button>
		</form>
		<Button
			variant={data.showInactive ? 'default' : 'outline'}
			size="sm"
			onclick={toggleInactive}
		>
			{data.showInactive ? 'Showing All' : 'Show Inactive'}
		</Button>
	</div>

	<!-- Projects Table -->
	<Card.Root>
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head class="w-16">ID</Table.Head>
					<Table.Head>Name</Table.Head>
					<Table.Head class="w-24">Status</Table.Head>
					<Table.Head class="w-24">Members</Table.Head>
					<Table.Head class="w-32">Created</Table.Head>
					<Table.Head class="w-32">Actions</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each data.projects as proj (proj.id)}
					<Table.Row>
						<Table.Cell class="text-muted-foreground">{proj.id}</Table.Cell>
						<Table.Cell>
							<a
								href="/projects/{proj.id}"
								class="text-primary font-medium hover:underline"
							>
								{proj.name}
							</a>
						</Table.Cell>
						<Table.Cell>
							<Badge variant={proj.active ? 'default' : 'secondary'}>
								{proj.active ? 'Active' : 'Inactive'}
							</Badge>
						</Table.Cell>
						<Table.Cell>{proj.memberCount}</Table.Cell>
						<Table.Cell class="text-muted-foreground text-xs">
							{new Date(proj.createdAt).toLocaleDateString()}
						</Table.Cell>
						<Table.Cell>
							<form method="POST" action="?/toggleActive" use:enhance={handleResult}>
								<input type="hidden" name="projectId" value={proj.id} />
								<input type="hidden" name="active" value={proj.active ? 'false' : 'true'} />
								<Button
									type="submit"
									variant="ghost"
									size="sm"
									class="h-7 px-2 text-xs {proj.active ? 'text-destructive' : 'text-green-600'}"
								>
									{proj.active ? 'Deactivate' : 'Activate'}
								</Button>
							</form>
						</Table.Cell>
					</Table.Row>
				{/each}
				{#if data.projects.length === 0}
					<Table.Row>
						<Table.Cell colspan={6} class="text-muted-foreground text-center">
							No projects found.
						</Table.Cell>
					</Table.Row>
				{/if}
			</Table.Body>
		</Table.Root>
	</Card.Root>

	<!-- Pagination -->
	{#if data.pagination.totalPages > 1}
		<div class="flex items-center justify-between">
			<p class="text-muted-foreground text-sm">
				{data.pagination.total} projects total
			</p>
			<div class="flex gap-2">
				{#if data.pagination.page > 1}
					<Button
						variant="outline"
						size="sm"
						href="/admin/projects?page={data.pagination.page - 1}{data.search ? `&search=${data.search}` : ''}{data.showInactive ? '&inactive=true' : ''}"
					>
						Previous
					</Button>
				{/if}
				<span class="text-muted-foreground flex items-center text-sm">
					{data.pagination.page} / {data.pagination.totalPages}
				</span>
				{#if data.pagination.page < data.pagination.totalPages}
					<Button
						variant="outline"
						size="sm"
						href="/admin/projects?page={data.pagination.page + 1}{data.search ? `&search=${data.search}` : ''}{data.showInactive ? '&inactive=true' : ''}"
					>
						Next
					</Button>
				{/if}
			</div>
		</div>
	{/if}
</div>
