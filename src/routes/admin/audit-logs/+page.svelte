<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { untrack } from 'svelte';

	let { data } = $props();

	// Local mutable filter state — synced from server data via $effect
	let userId = $state('');
	let selectedAction = $state('');
	let from = $state('');
	let to = $state('');

	$effect(() => {
		const filters = data.filters;
		untrack(() => {
			userId = filters.userId;
			selectedAction = filters.action;
			from = filters.from;
			to = filters.to;
		});
	});

	function applyFilters() {
		const params = new URLSearchParams();
		if (userId) params.set('userId', userId);
		if (selectedAction) params.set('action', selectedAction);
		if (from) params.set('from', from);
		if (to) params.set('to', to);
		params.set('page', '1');
		goto(`/admin/audit-logs?${params.toString()}`);
	}

	function resetFilters() {
		userId = '';
		selectedAction = '';
		from = '';
		to = '';
		goto('/admin/audit-logs');
	}

	function buildPageUrl(p: number): string {
		const params = new URLSearchParams(page.url.searchParams);
		params.set('page', String(p));
		return `/admin/audit-logs?${params.toString()}`;
	}

	const ACTION_BADGE_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
		LOGIN: 'default',
		REGISTER: 'default',
		CREATE_PROJECT: 'secondary',
		UPDATE_PROJECT: 'secondary',
		DELETE_PROJECT: 'destructive',
		ADD_MEMBER: 'secondary',
		REMOVE_MEMBER: 'destructive',
		CHANGE_ROLE: 'outline'
	};

	function badgeVariant(act: string): 'default' | 'secondary' | 'destructive' | 'outline' {
		return ACTION_BADGE_VARIANT[act] ?? 'outline';
	}

	const hasFilters = $derived(
		!!(data.filters.userId || data.filters.action || data.filters.from || data.filters.to)
	);
</script>

<div class="space-y-4">
	<!-- Filters -->
	<Card.Root class="p-4">
		<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
			<Input
				placeholder={m.audit_logs_filter_user()}
				bind:value={userId}
				aria-label={m.audit_logs_col_user()}
			/>
			<Select.Root type="single" bind:value={selectedAction}>
				<Select.Trigger>
					{selectedAction || m.audit_logs_all_actions()}
				</Select.Trigger>
				<Select.Content>
					<Select.Item value="">{m.audit_logs_all_actions()}</Select.Item>
					{#each data.actions as act (act)}
						<Select.Item value={act}>{act}</Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>
			<Input type="date" bind:value={from} max={to || undefined} aria-label={m.audit_logs_filter_from()} />
			<Input type="date" bind:value={to} min={from || undefined} aria-label={m.audit_logs_filter_to()} />
		</div>
		<div class="mt-3 flex gap-2">
			<Button size="sm" onclick={applyFilters}>{m.common_search()}</Button>
			{#if hasFilters}
				<Button size="sm" variant="outline" onclick={resetFilters}>{m.common_all()}</Button>
			{/if}
		</div>
	</Card.Root>

	<!-- Table -->
	<Card.Root>
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head class="w-40">{m.audit_logs_col_date()}</Table.Head>
					<Table.Head>{m.audit_logs_col_user()}</Table.Head>
					<Table.Head class="w-40">{m.audit_logs_col_action()}</Table.Head>
					<Table.Head>{m.audit_logs_col_entity()}</Table.Head>
					<Table.Head class="w-24">{m.audit_logs_col_project()}</Table.Head>
					<Table.Head class="w-32">{m.audit_logs_col_ip()}</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each data.logs as log (log.id)}
					<Table.Row>
						<Table.Cell class="text-muted-foreground whitespace-nowrap text-xs">
							{new Date(log.createdAt).toLocaleString()}
						</Table.Cell>
						<Table.Cell>
							{#if log.userName}
								<div class="text-sm font-medium">{log.userName}</div>
								<div class="text-muted-foreground text-xs">{log.userEmail}</div>
							{:else}
								<span class="text-muted-foreground text-xs">{m.audit_logs_system()}</span>
							{/if}
						</Table.Cell>
						<Table.Cell>
							<Badge variant={badgeVariant(log.action)} class="font-mono text-xs">
								{log.action}
							</Badge>
						</Table.Cell>
						<Table.Cell class="text-sm">
							{#if log.entityType}
								<span class="text-muted-foreground text-xs">{log.entityType}</span>
								{#if log.entityId}
									<span class="ml-1 font-mono text-xs">#{log.entityId}</span>
								{/if}
							{:else}
								<span class="text-muted-foreground">—</span>
							{/if}
						</Table.Cell>
						<Table.Cell class="text-muted-foreground text-xs">
							{log.projectId ?? '—'}
						</Table.Cell>
						<Table.Cell class="text-muted-foreground font-mono text-xs">
							{log.ipAddress ?? '—'}
						</Table.Cell>
					</Table.Row>
				{/each}
				{#if data.logs.length === 0}
					<Table.Row>
						<Table.Cell colspan={6} class="py-12 text-center">
							<div class="flex flex-col items-center gap-2">
								<p class="text-muted-foreground font-medium">{m.audit_logs_no_results()}</p>
								<p class="text-muted-foreground text-sm">{m.audit_logs_no_results_hint()}</p>
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
				{m.audit_logs_total({ count: data.pagination.total })}
			</p>
			<div class="flex gap-2">
				{#if data.pagination.page > 1}
					<Button variant="outline" size="sm" href={buildPageUrl(data.pagination.page - 1)}>
						{m.common_previous()}
					</Button>
				{/if}
				<span class="text-muted-foreground flex items-center text-sm">
					{data.pagination.page} / {data.pagination.totalPages}
				</span>
				{#if data.pagination.page < data.pagination.totalPages}
					<Button variant="outline" size="sm" href={buildPageUrl(data.pagination.page + 1)}>
						{m.common_next()}
					</Button>
				{/if}
			</div>
		</div>
	{/if}
</div>
