<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { enhance } from '$app/forms';
	import { goto, invalidateAll } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';

	let { data } = $props();

	let searchInput = $state('');
	$effect(() => {
		searchInput = data.search;
	});

	// Toggle confirmation state
	let confirmDialogOpen = $state(false);
	let confirmProjectId = $state<number | null>(null);
	let confirmProjectName = $state('');
	let confirmProjectActive = $state(false);
	let confirmFormRef = $state<HTMLFormElement | null>(null);

	function openToggleConfirm(proj: (typeof data.projects)[0], formEl: HTMLFormElement) {
		confirmProjectId = proj.id;
		confirmProjectName = proj.name;
		confirmProjectActive = proj.active;
		confirmFormRef = formEl;
		confirmDialogOpen = true;
	}

	function handleConfirmToggle() {
		confirmFormRef?.requestSubmit();
		confirmDialogOpen = false;
	}

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
	<div class="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
		<form
			onsubmit={(e) => {
				e.preventDefault();
				doSearch();
			}}
			class="flex flex-col gap-2 sm:flex-row"
		>
			<Input
				placeholder={m.admin_projects_search()}
				class="w-full sm:max-w-sm"
				bind:value={searchInput}
				aria-label={m.admin_projects_search()}
			/>
			<Button type="submit" variant="outline" class="w-full sm:w-auto">{m.common_search()}</Button>
		</form>
		<Button
			variant={data.showInactive ? 'default' : 'outline'}
			size="sm"
			class="w-full sm:w-auto"
			onclick={toggleInactive}
		>
			{data.showInactive ? m.admin_projects_showing_all() : m.admin_projects_show_inactive()}
		</Button>
	</div>

	<!-- Mobile projects list -->
	<div class="space-y-3 sm:hidden">
		{#each data.projects as proj (proj.id)}
			<Card.Root class="gap-3 rounded-lg p-4">
				<div class="min-w-0 space-y-1">
					<a
						href="/projects/{proj.id}"
						class="text-primary block break-words text-sm font-semibold leading-snug hover:underline"
					>
						{proj.name}
					</a>
					<div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
						<span>{m.admin_projects_id()} {proj.id}</span>
						<span>{m.dashboard_members()}: {proj.memberCount}</span>
						<span>{new Date(proj.createdAt).toLocaleDateString()}</span>
					</div>
				</div>
				<div class="flex flex-wrap items-center justify-between gap-2">
					<Badge variant={proj.active ? 'default' : 'secondary'}>
						{proj.active ? m.common_active() : m.common_inactive()}
					</Badge>
					<form
						method="POST"
						action="?/toggleActive"
						use:enhance={handleResult}
						onsubmit={(e) => {
							if (!confirmDialogOpen) {
								e.preventDefault();
								openToggleConfirm(proj, e.currentTarget as HTMLFormElement);
							}
						}}
					>
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
				</div>
			</Card.Root>
		{/each}
		{#if data.projects.length === 0}
			<Card.Root class="rounded-lg p-6 text-center">
				<p class="text-sm font-medium text-muted-foreground">{m.admin_projects_no_results()}</p>
				<p class="mt-1 text-xs text-muted-foreground">{m.admin_projects_no_results_hint()}</p>
			</Card.Root>
		{/if}
	</div>

	<!-- Projects Table -->
	<Card.Root class="hidden overflow-hidden sm:flex">
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head class="hidden w-16 sm:table-cell">{m.admin_projects_id()}</Table.Head>
					<Table.Head>{m.common_name()}</Table.Head>
					<Table.Head class="w-24">{m.common_status()}</Table.Head>
					<Table.Head class="hidden w-24 sm:table-cell">{m.dashboard_members()}</Table.Head>
					<Table.Head class="hidden w-32 md:table-cell">{m.common_created()}</Table.Head>
					<Table.Head class="w-28">{m.common_actions()}</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each data.projects as proj (proj.id)}
					<Table.Row>
						<Table.Cell class="text-muted-foreground hidden sm:table-cell">{proj.id}</Table.Cell>
						<Table.Cell>
							<a
								href="/projects/{proj.id}"
								class="text-primary block max-w-52 truncate font-medium hover:underline sm:max-w-none"
								title={proj.name}
							>
								{proj.name}
							</a>
							<div class="text-muted-foreground mt-0.5 text-xs sm:hidden">
								{m.admin_projects_id()}
								{proj.id}
							</div>
						</Table.Cell>
						<Table.Cell>
							<Badge variant={proj.active ? 'default' : 'secondary'}>
								{proj.active ? m.common_active() : m.common_inactive()}
							</Badge>
						</Table.Cell>
						<Table.Cell class="hidden sm:table-cell">{proj.memberCount}</Table.Cell>
						<Table.Cell class="text-muted-foreground hidden text-xs md:table-cell">
							{new Date(proj.createdAt).toLocaleDateString()}
						</Table.Cell>
						<Table.Cell>
							<form
								method="POST"
								action="?/toggleActive"
								use:enhance={handleResult}
								onsubmit={(e) => {
									if (!confirmDialogOpen) {
										e.preventDefault();
										openToggleConfirm(proj, e.currentTarget as HTMLFormElement);
									}
								}}
							>
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
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="40"
									height="40"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="1.5"
									stroke-linecap="round"
									stroke-linejoin="round"
									class="text-muted-foreground"
								>
									<path
										d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"
									/>
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
		<div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
			<p class="text-muted-foreground text-sm">
				{m.admin_projects_total({ count: data.pagination.total })}
			</p>
			<div class="flex flex-wrap gap-2">
				{#if data.pagination.page > 1}
					<Button
						variant="outline"
						size="sm"
						href="/admin/projects?page={data.pagination.page - 1}{data.search
							? `&search=${data.search}`
							: ''}{data.showInactive ? '&inactive=true' : ''}"
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
						href="/admin/projects?page={data.pagination.page + 1}{data.search
							? `&search=${data.search}`
							: ''}{data.showInactive ? '&inactive=true' : ''}"
					>
						{m.common_next()}
					</Button>
				{/if}
			</div>
		</div>
	{/if}
</div>

<!-- Toggle Active Confirmation Dialog -->
<AlertDialog.Root bind:open={confirmDialogOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{m.admin_confirm_toggle_title()}</AlertDialog.Title>
			<AlertDialog.Description>
				{confirmProjectActive ? m.admin_confirm_deactivate() : m.admin_confirm_activate()}
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel class="w-full sm:w-auto">{m.common_cancel()}</AlertDialog.Cancel>
			<Button
				variant={confirmProjectActive ? 'destructive' : 'default'}
				class="w-full sm:w-auto"
				onclick={handleConfirmToggle}
			>
				{confirmProjectActive ? m.admin_projects_deactivate() : m.admin_projects_activate()}
			</Button>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
