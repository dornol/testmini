<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
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
				toast.success(m.admin_updated());
				await invalidateAll();
			} else if (result.type === 'failure') {
				toast.error((result.data?.error as string) ?? m.error_operation_failed());
				await update();
			}
		};
	}
</script>

<div class="space-y-4">
	<!-- Search & Filters -->
	<div class="flex flex-wrap items-center gap-2">
		<form onsubmit={(e) => { e.preventDefault(); doSearch(); }} class="flex gap-2">
			<Input placeholder={m.admin_projects_search()} class="max-w-sm" bind:value={searchInput} aria-label={m.admin_projects_search()} />
			<Button type="submit" variant="outline">{m.common_search()}</Button>
		</form>
		<Button
			variant={data.showInactive ? 'default' : 'outline'}
			size="sm"
			onclick={toggleInactive}
		>
			{data.showInactive ? m.admin_projects_showing_all() : m.admin_projects_show_inactive()}
		</Button>
	</div>

	<!-- Projects Table -->
	<Card.Root>
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head class="w-16">{m.admin_projects_id()}</Table.Head>
					<Table.Head>{m.common_name()}</Table.Head>
					<Table.Head class="w-24">{m.common_status()}</Table.Head>
					<Table.Head class="w-24">{m.dashboard_members()}</Table.Head>
					<Table.Head class="w-32">{m.common_created()}</Table.Head>
					<Table.Head class="w-32">{m.common_actions()}</Table.Head>
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
								{proj.active ? m.common_active() : m.common_inactive()}
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
									{proj.active ? m.admin_projects_deactivate() : m.admin_projects_activate()}
								</Button>
							</form>
						</Table.Cell>
					</Table.Row>
				{/each}
				{#if data.projects.length === 0}
					<Table.Row>
						<Table.Cell colspan={6} class="py-12 text-center">
							<div class="flex flex-col items-center gap-2">
								<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground">
									<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
								</svg>
								<p class="text-muted-foreground font-medium">{m.admin_projects_no_results()}</p>
								<p class="text-muted-foreground text-sm">{m.admin_projects_no_results_hint()}</p>
							</div>
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
				{m.admin_projects_total({ count: data.pagination.total })}
			</p>
			<div class="flex gap-2">
				{#if data.pagination.page > 1}
					<Button
						variant="outline"
						size="sm"
						href="/admin/projects?page={data.pagination.page - 1}{data.search ? `&search=${data.search}` : ''}{data.showInactive ? '&inactive=true' : ''}"
					>
						{m.common_previous()}
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
						{m.common_next()}
					</Button>
				{/if}
			</div>
		</div>
	{/if}
</div>
