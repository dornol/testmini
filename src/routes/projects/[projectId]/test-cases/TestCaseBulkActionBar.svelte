<script lang="ts">
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import * as m from '$lib/paraglide/messages.js';
	import { toast } from 'svelte-sonner';
	import { apiPost } from '$lib/api-client';
	import PriorityBadge from '$lib/components/PriorityBadge.svelte';

	interface Props {
		selectedTcIds: Set<number>;
		projectId: number;
		projectTags: { id: number; name: string; color: string }[];
		projectPriorities: { id: number; name: string; color: string; position: number; isDefault: boolean }[];
		projectMembers: { userId: string; userName: string }[];
		groups: { id: number; name: string }[];
		projectSuites: { id: number; name: string }[];
		canDelete: boolean;
		oncomplete: () => void;
		onclear: () => void;
	}

	let {
		selectedTcIds, projectId, projectTags, projectPriorities, projectMembers, groups, projectSuites,
		canDelete, oncomplete, onclear
	}: Props = $props();
	let bulkLoading = $state(false);
	let bulkDeleteOpen = $state(false);

	async function bulkAction(action: string, extra: Record<string, unknown> = {}) {
		if (selectedTcIds.size === 0 || bulkLoading) return;
		bulkLoading = true;
		try {
			const result = await apiPost<{ affected: number }>(`/api/projects/${projectId}/test-cases/bulk`, {
				action,
				testCaseIds: [...selectedTcIds],
				...extra
			});
			if (action === 'delete') {
				toast.success(m.tc_bulk_deleted({ count: result.affected }));
			} else if (action === 'clone') {
				toast.success(m.tc_bulk_cloned({ count: result.affected }));
			} else {
				toast.success(m.tc_bulk_success({ count: result.affected }));
			}
			oncomplete();
		} catch {
			// error toast handled by apiPost
		} finally {
			bulkLoading = false;
			bulkDeleteOpen = false;
		}
	}

	async function bulkAddToSuite(suiteId: number) {
		if (selectedTcIds.size === 0 || bulkLoading) return;
		bulkLoading = true;
		try {
			await apiPost(`/api/projects/${projectId}/test-suites/${suiteId}/items`, {
				testCaseIds: [...selectedTcIds]
			});
			toast.success(m.suite_updated());
			oncomplete();
		} catch {
			// error toast handled by apiPost
		} finally {
			bulkLoading = false;
		}
	}
</script>

<div class="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/50 px-4 py-2">
	<span class="text-sm font-medium">{m.tc_bulk_selected({ count: selectedTcIds.size })}</span>
	<div class="h-4 w-px bg-border"></div>

	<!-- Bulk Add Tag -->
	{#if projectTags.length > 0}
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<Button variant="outline" size="sm" class="h-7 text-xs" disabled={bulkLoading} {...props}>{m.tc_bulk_add_tag()}</Button>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="start" class="min-w-[140px]">
				{#each projectTags as t (t.id)}
					<DropdownMenu.Item onclick={() => bulkAction('addTag', { tagId: t.id })} class="text-xs">
						<span class="mr-1.5 inline-block h-2 w-2 rounded-full" style="background-color: {t.color}"></span>
						{t.name}
					</DropdownMenu.Item>
				{/each}
			</DropdownMenu.Content>
		</DropdownMenu.Root>

		<!-- Bulk Remove Tag -->
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<Button variant="outline" size="sm" class="h-7 text-xs" disabled={bulkLoading} {...props}>{m.tc_bulk_remove_tag()}</Button>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="start" class="min-w-[140px]">
				{#each projectTags as t (t.id)}
					<DropdownMenu.Item onclick={() => bulkAction('removeTag', { tagId: t.id })} class="text-xs">
						<span class="mr-1.5 inline-block h-2 w-2 rounded-full" style="background-color: {t.color}"></span>
						{t.name}
					</DropdownMenu.Item>
				{/each}
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	{/if}

	<!-- Bulk Add Assignee -->
	{#if projectMembers.length > 0}
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<Button variant="outline" size="sm" class="h-7 text-xs" disabled={bulkLoading} {...props}>{m.tc_bulk_add_assignee()}</Button>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="start" class="min-w-[140px]">
				{#each projectMembers as member}
					<DropdownMenu.Item onclick={() => bulkAction('addAssignee', { userId: member.userId })} class="text-xs">
						{member.userName}
					</DropdownMenu.Item>
				{/each}
			</DropdownMenu.Content>
		</DropdownMenu.Root>

		<!-- Bulk Remove Assignee -->
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<Button variant="outline" size="sm" class="h-7 text-xs" disabled={bulkLoading} {...props}>{m.tc_bulk_remove_assignee()}</Button>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="start" class="min-w-[140px]">
				{#each projectMembers as member}
					<DropdownMenu.Item onclick={() => bulkAction('removeAssignee', { userId: member.userId })} class="text-xs">
						{member.userName}
					</DropdownMenu.Item>
				{/each}
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	{/if}

	<!-- Bulk Set Priority -->
	<DropdownMenu.Root>
		<DropdownMenu.Trigger>
			{#snippet child({ props })}
				<Button variant="outline" size="sm" class="h-7 text-xs" disabled={bulkLoading} {...props}>{m.tc_bulk_set_priority()}</Button>
			{/snippet}
		</DropdownMenu.Trigger>
		<DropdownMenu.Content align="start" class="min-w-[120px]">
			{#each projectPriorities as p (p.id)}
				<DropdownMenu.Item onclick={() => bulkAction('setPriority', { priority: p.name })} class="text-xs">
					<PriorityBadge name={p.name} color={p.color} />
				</DropdownMenu.Item>
			{/each}
		</DropdownMenu.Content>
	</DropdownMenu.Root>

	<!-- Bulk Move to Group -->
	{#if groups.length > 0}
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<Button variant="outline" size="sm" class="h-7 text-xs" disabled={bulkLoading} {...props}>{m.tc_bulk_move_group()}</Button>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="start" class="min-w-[140px]">
				<DropdownMenu.Item onclick={() => bulkAction('moveToGroup', { groupId: null })} class="text-xs">
					{m.tc_filter_uncategorized()}
				</DropdownMenu.Item>
				{#each groups as g (g.id)}
					<DropdownMenu.Item onclick={() => bulkAction('moveToGroup', { groupId: g.id })} class="text-xs">
						{g.name}
					</DropdownMenu.Item>
				{/each}
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	{/if}

	<!-- Bulk Add to Suite -->
	{#if projectSuites.length > 0}
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<Button variant="outline" size="sm" class="h-7 text-xs" disabled={bulkLoading} {...props}>{m.suite_add_cases()}</Button>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="start" class="min-w-[140px]">
				{#each projectSuites as s (s.id)}
					<DropdownMenu.Item onclick={() => bulkAddToSuite(s.id)} class="text-xs">
						{s.name}
					</DropdownMenu.Item>
				{/each}
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	{/if}

	<!-- Bulk Clone -->
	<Button variant="outline" size="sm" class="h-7 text-xs" disabled={bulkLoading} onclick={() => bulkAction('clone')}>
		{m.tc_bulk_clone()}
	</Button>

	<!-- Bulk Delete -->
	{#if canDelete}
		<AlertDialog.Root bind:open={bulkDeleteOpen}>
			<AlertDialog.Trigger>
				{#snippet child({ props })}
					<Button variant="destructive" size="sm" class="h-7 text-xs" disabled={bulkLoading} {...props}>{m.tc_bulk_delete()}</Button>
				{/snippet}
			</AlertDialog.Trigger>
			<AlertDialog.Portal>
				<AlertDialog.Overlay />
				<AlertDialog.Content>
					<AlertDialog.Header>
						<AlertDialog.Title>{m.tc_bulk_delete_title()}</AlertDialog.Title>
						<AlertDialog.Description>
							{m.tc_bulk_delete_confirm({ count: selectedTcIds.size })}
						</AlertDialog.Description>
					</AlertDialog.Header>
					<AlertDialog.Footer>
						<AlertDialog.Cancel>{m.common_cancel()}</AlertDialog.Cancel>
						<Button variant="destructive" disabled={bulkLoading} onclick={() => bulkAction('delete')}>{m.common_delete()}</Button>
					</AlertDialog.Footer>
				</AlertDialog.Content>
			</AlertDialog.Portal>
		</AlertDialog.Root>
	{/if}

	<Button variant="ghost" size="sm" class="h-7 text-xs ml-auto" onclick={onclear}>
		{m.common_cancel()}
	</Button>
</div>
