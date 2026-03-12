<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import * as Table from '$lib/components/ui/table/index.js';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import * as m from '$lib/paraglide/messages.js';
	import { apiDelete } from '$lib/api-client';

	let { data } = $props();

	const basePath = $derived(`/projects/${data.project.id}/test-plans`);
	const canManage = $derived(
		data.userRole === 'PROJECT_ADMIN' || data.userRole === 'QA' || data.userRole === 'DEV' || data.userRole === 'ADMIN'
	);
	const canDelete = $derived(
		data.userRole === 'PROJECT_ADMIN' || data.userRole === 'ADMIN'
	);

	let statusFilter = $state('');

	const filteredPlans = $derived(
		statusFilter
			? data.plans.filter((p) => p.status === statusFilter)
			: data.plans
	);

	const statuses = ['DRAFT', 'IN_REVIEW', 'APPROVED', 'ACTIVE', 'COMPLETED', 'ARCHIVED'] as const;

	function statusLabel(s: string) {
		const map: Record<string, () => string> = {
			DRAFT: m.tp_status_draft,
			IN_REVIEW: m.tp_status_in_review,
			APPROVED: m.tp_status_approved,
			ACTIVE: m.tp_status_active,
			COMPLETED: m.tp_status_completed,
			ARCHIVED: m.tp_status_archived
		};
		return map[s]?.() ?? s;
	}

	function statusVariant(s: string): 'default' | 'secondary' | 'outline' | 'destructive' {
		switch (s) {
			case 'DRAFT': return 'outline';
			case 'IN_REVIEW': return 'secondary';
			case 'APPROVED': return 'default';
			case 'ACTIVE': return 'default';
			case 'COMPLETED': return 'default';
			case 'ARCHIVED': return 'outline';
			default: return 'outline';
		}
	}

	// Delete dialog
	let deleteDialogOpen = $state(false);
	let deleteId = $state<number | null>(null);
	let deleteSaving = $state(false);

	function openDelete(id: number) {
		deleteId = id;
		deleteDialogOpen = true;
	}

	async function handleDelete() {
		if (!deleteId) return;
		deleteSaving = true;
		try {
			await apiDelete(`/api/projects/${data.project.id}/test-plans/${deleteId}`);
			deleteDialogOpen = false;
			toast.success(m.tp_deleted());
			await invalidateAll();
		} catch {
			// error toast handled by apiDelete
		} finally {
			deleteSaving = false;
		}
	}

	function formatDate(date: string | Date | null) {
		if (!date) return '-';
		return new Date(date).toLocaleDateString();
	}
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<h2 class="text-lg font-semibold">{m.tp_title()}</h2>
		{#if canManage}
			<Button size="sm" href="{basePath}/new">{m.tp_new()}</Button>
		{/if}
	</div>

	<!-- Status filter tabs -->
	<div class="flex gap-1 flex-wrap">
		<Button
			variant={statusFilter === '' ? 'default' : 'outline'}
			size="sm"
			onclick={() => (statusFilter = '')}
		>
			{m.common_all()}
		</Button>
		{#each statuses as s}
			<Button
				variant={statusFilter === s ? 'default' : 'outline'}
				size="sm"
				onclick={() => (statusFilter = s)}
			>
				{statusLabel(s)}
			</Button>
		{/each}
	</div>

	{#if filteredPlans.length === 0}
		<div class="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
			<h3 class="text-lg font-semibold">{m.tp_empty_title()}</h3>
			<p class="text-muted-foreground mt-1 text-sm">{m.tp_empty_create()}</p>
			{#if canManage}
				<Button class="mt-4" href="{basePath}/new">{m.tp_create()}</Button>
			{/if}
		</div>
	{:else}
		<div class="border rounded-md overflow-hidden">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head class="py-1 px-2 text-xs">{m.common_name()}</Table.Head>
						<Table.Head class="w-28 py-1 px-2 text-xs">{m.common_status()}</Table.Head>
						<Table.Head class="w-28 py-1 px-2 text-xs">{m.tp_milestone()}</Table.Head>
						<Table.Head class="w-24 py-1 px-2 text-xs">{m.nav_test_cases()}</Table.Head>
						<Table.Head class="w-20 py-1 px-2 text-xs">{m.nav_test_runs()}</Table.Head>
						<Table.Head class="w-24 py-1 px-2 text-xs">{m.tr_created_by()}</Table.Head>
						<Table.Head class="w-28 py-1 px-2 text-xs">{m.tr_created_at()}</Table.Head>
						{#if canDelete}
							<Table.Head class="w-16 py-1 px-2 text-xs">{m.common_actions()}</Table.Head>
						{/if}
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each filteredPlans as plan (plan.id)}
						<Table.Row
							class="cursor-pointer hover:bg-muted/50"
							onclick={() => goto(`${basePath}/${plan.id}`)}
						>
							<Table.Cell class="py-1 px-2 text-xs font-medium">{plan.name}</Table.Cell>
							<Table.Cell class="py-1 px-2 text-xs">
								<Badge variant={statusVariant(plan.status)}>{statusLabel(plan.status)}</Badge>
							</Table.Cell>
							<Table.Cell class="text-muted-foreground py-1 px-2 text-xs">{plan.milestone ?? '-'}</Table.Cell>
							<Table.Cell class="py-1 px-2 text-xs">{plan.itemCount}</Table.Cell>
							<Table.Cell class="py-1 px-2 text-xs">{plan.runCount}</Table.Cell>
							<Table.Cell class="text-muted-foreground py-1 px-2 text-xs">{plan.createdBy}</Table.Cell>
							<Table.Cell class="text-muted-foreground py-1 px-2 text-xs">{formatDate(plan.createdAt)}</Table.Cell>
							{#if canDelete}
								<Table.Cell class="py-1 px-2">
									<DropdownMenu.Root>
										<DropdownMenu.Trigger>
											{#snippet child({ props })}
												<Button variant="ghost" size="sm" class="h-6 w-6 p-0" {...props} onclick={(e: MouseEvent) => e.stopPropagation()} aria-label={m.common_actions()}>
													<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>
												</Button>
											{/snippet}
										</DropdownMenu.Trigger>
										<DropdownMenu.Content align="end">
											<DropdownMenu.Item onclick={() => goto(`${basePath}/${plan.id}`)}>
												{m.common_edit()}
											</DropdownMenu.Item>
											<DropdownMenu.Separator />
											<DropdownMenu.Item class="text-destructive" onclick={() => { openDelete(plan.id); }}>
												{m.common_delete()}
											</DropdownMenu.Item>
										</DropdownMenu.Content>
									</DropdownMenu.Root>
								</Table.Cell>
							{/if}
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</div>
	{/if}
</div>

<!-- Delete Plan Dialog -->
<AlertDialog.Root bind:open={deleteDialogOpen}>
	<AlertDialog.Portal>
		<AlertDialog.Overlay />
		<AlertDialog.Content>
			<AlertDialog.Header>
				<AlertDialog.Title>{m.tp_delete_title()}</AlertDialog.Title>
				<AlertDialog.Description>{m.tp_delete_confirm()}</AlertDialog.Description>
			</AlertDialog.Header>
			<AlertDialog.Footer>
				<AlertDialog.Cancel>{m.common_cancel()}</AlertDialog.Cancel>
				<Button variant="destructive" onclick={handleDelete} disabled={deleteSaving}>
					{deleteSaving ? m.common_saving() : m.common_delete()}
				</Button>
			</AlertDialog.Footer>
		</AlertDialog.Content>
	</AlertDialog.Portal>
</AlertDialog.Root>
