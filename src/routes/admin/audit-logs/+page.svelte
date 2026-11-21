<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { goto } from '$app/navigation';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';

	let { data } = $props();

	type Log = (typeof data.logs)[number];
	type Filters = { userId: string; action: string; from: string; to: string };

	// Follow the URL, but stay editable while typing.
	let userId = $derived(data.filters.userId);
	let selectedAction = $derived(data.filters.action);
	let from = $derived(data.filters.from);
	let to = $derived(data.filters.to);

	// The project filter has no field here, so carry it through instead of dropping it silently.
	function listUrl(filters: Partial<Filters> = {}, pageNo = 1) {
		const f = { userId, action: selectedAction, from, to, ...filters };
		const params = new URLSearchParams();
		if (f.userId) params.set('userId', f.userId);
		if (f.action) params.set('action', f.action);
		if (data.filters.projectId) params.set('projectId', data.filters.projectId);
		if (f.from) params.set('from', f.from);
		if (f.to) params.set('to', f.to);
		if (pageNo > 1) params.set('page', String(pageNo));
		const query = params.toString();
		return query ? `/admin/audit-logs?${query}` : '/admin/audit-logs';
	}

	const ACTION_BADGE_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> =
		{
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
		!!(
			data.filters.userId ||
			data.filters.action ||
			data.filters.projectId ||
			data.filters.from ||
			data.filters.to
		)
	);

	const hasMetadata = (log: Log) => !!log.metadata && Object.keys(log.metadata).length > 0;
</script>

{#snippet when(log: Log)}
	<time datetime={new Date(log.createdAt).toISOString()}>
		{new Date(log.createdAt).toLocaleString()}
	</time>
{/snippet}

{#snippet who(log: Log)}
	{#if log.userId && log.userName}
		<a
			href={listUrl({ ...data.filters, userId: log.userId })}
			class="text-sm font-medium [overflow-wrap:anywhere] hover:underline"
			aria-label={m.audit_logs_filter_by_user({ name: log.userName })}>{log.userName}</a
		>
		<p class="text-xs text-muted-foreground [overflow-wrap:anywhere]">{log.userEmail}</p>
	{:else}
		<span class="text-xs text-muted-foreground">{m.audit_logs_system()}</span>
	{/if}
{/snippet}

{#snippet details(log: Log)}
	{#if hasMetadata(log)}
		<details class="mt-1 text-xs">
			<summary class="cursor-pointer text-muted-foreground">{m.audit_logs_details()}</summary>
			<pre
				class="mt-1 max-h-48 overflow-auto rounded-md bg-muted p-2 font-mono whitespace-pre-wrap [overflow-wrap:anywhere]">{JSON.stringify(
					log.metadata,
					null,
					2
				)}</pre>
		</details>
	{/if}
{/snippet}

<div class="space-y-4">
	<!-- Filters -->
	<Card.Root class="p-4">
		<form
			role="search"
			aria-label={m.audit_logs_title()}
			onsubmit={(e) => {
				e.preventDefault();
				goto(listUrl());
			}}
		>
			<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<div class="space-y-1.5">
					<Label for="audit-user">{m.audit_logs_filter_user_id()}</Label>
					<Input
						id="audit-user"
						maxlength={255}
						bind:value={userId}
						aria-describedby="audit-user-hint"
					/>
				</div>
				<div class="space-y-1.5">
					<Label for="audit-action">{m.audit_logs_col_action()}</Label>
					<select
						id="audit-action"
						bind:value={selectedAction}
						class="h-10 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-2 focus-visible:outline-ring"
					>
						<option value="">{m.audit_logs_all_actions()}</option>
						{#each data.actions as act (act)}
							<option value={act}>{act}</option>
						{/each}
					</select>
				</div>
				<div class="space-y-1.5">
					<Label for="audit-from">{m.audit_logs_filter_from()}</Label>
					<Input id="audit-from" type="date" bind:value={from} max={to || undefined} />
				</div>
				<div class="space-y-1.5">
					<Label for="audit-to">{m.audit_logs_filter_to()}</Label>
					<Input id="audit-to" type="date" bind:value={to} min={from || undefined} />
				</div>
			</div>
			<p id="audit-user-hint" class="mt-2 text-xs text-muted-foreground">
				{m.audit_logs_filter_user_hint()}
			</p>
			<div class="mt-3 grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:flex sm:items-center">
				<Button type="submit" class="min-h-10 w-full sm:w-auto">{m.common_search()}</Button>
				{#if hasFilters}
					<Button
						type="button"
						variant="outline"
						class="min-h-10 w-full sm:w-auto"
						onclick={() => goto('/admin/audit-logs')}
					>
						{m.common_clear_filters()}
					</Button>
				{/if}
				{#if data.filters.projectId}
					<Badge variant="secondary">{m.audit_logs_col_project()} #{data.filters.projectId}</Badge>
				{/if}
			</div>
		</form>
	</Card.Root>

	<!-- Mobile audit log list -->
	<div class="space-y-3 md:hidden">
		{#each data.logs as log (log.id)}
			<Card.Root class="gap-3 rounded-lg p-4">
				<div class="flex flex-wrap items-center justify-between gap-2">
					<Badge
						variant={badgeVariant(log.action)}
						class="max-w-full justify-start overflow-visible text-left font-mono text-xs break-all whitespace-normal"
					>
						{log.action}
					</Badge>
					<span class="text-xs text-muted-foreground">{@render when(log)}</span>
				</div>

				<div class="min-w-0 space-y-1">{@render who(log)}</div>

				<div class="grid gap-2 text-xs text-muted-foreground">
					<div class="min-w-0 [overflow-wrap:anywhere]">
						<span class="font-medium text-foreground">{m.audit_logs_col_entity()}:</span>
						{#if log.entityType}
							<span>{log.entityType}</span>
							{#if log.entityId}<span class="font-mono">#{log.entityId}</span>{/if}
						{:else}
							<span>—</span>
						{/if}
					</div>
					<div class="flex flex-wrap gap-x-3 gap-y-1">
						<span>
							<span class="font-medium text-foreground">{m.audit_logs_col_project()}:</span>
							{log.projectId ?? '—'}
						</span>
						<span class="[overflow-wrap:anywhere]">
							<span class="font-medium text-foreground">{m.audit_logs_col_ip()}:</span>
							{log.ipAddress ?? '—'}
						</span>
					</div>
					{@render details(log)}
				</div>
			</Card.Root>
		{/each}
		{#if data.logs.length === 0}
			<Card.Root class="rounded-lg p-6 text-center">
				<p class="text-sm font-medium text-muted-foreground">{m.audit_logs_no_results()}</p>
				<p class="mt-1 text-xs text-muted-foreground">{m.audit_logs_no_results_hint()}</p>
			</Card.Root>
		{/if}
	</div>

	<!-- Table -->
	<Card.Root class="hidden overflow-hidden md:flex">
		<Table.Root class="table-fixed" aria-label={m.audit_logs_title()}>
			<Table.Header>
				<Table.Row>
					<Table.Head class="w-40">{m.audit_logs_col_date()}</Table.Head>
					<Table.Head>{m.audit_logs_col_user()}</Table.Head>
					<Table.Head class="w-44">{m.audit_logs_col_action()}</Table.Head>
					<Table.Head>{m.audit_logs_col_entity()}</Table.Head>
					<Table.Head class="w-24">{m.audit_logs_col_project()}</Table.Head>
					<Table.Head class="w-32">{m.audit_logs_col_ip()}</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each data.logs as log (log.id)}
					<Table.Row>
						<Table.Cell class="text-xs whitespace-normal text-muted-foreground"
							>{@render when(log)}</Table.Cell
						>
						<Table.Cell class="whitespace-normal">{@render who(log)}</Table.Cell>
						<Table.Cell class="whitespace-normal">
							<Badge
								variant={badgeVariant(log.action)}
								class="max-w-full justify-start overflow-visible text-left font-mono text-xs break-all whitespace-normal"
							>
								{log.action}
							</Badge>
						</Table.Cell>
						<Table.Cell class="text-sm whitespace-normal [overflow-wrap:anywhere]">
							{#if log.entityType}
								<div class="text-xs text-muted-foreground">{log.entityType}</div>
								{#if log.entityId}<div class="font-mono text-xs">#{log.entityId}</div>{/if}
							{:else}
								<span class="text-muted-foreground">—</span>
							{/if}
							{@render details(log)}
						</Table.Cell>
						<Table.Cell class="text-xs text-muted-foreground">{log.projectId ?? '—'}</Table.Cell>
						<Table.Cell
							class="font-mono text-xs whitespace-normal text-muted-foreground [overflow-wrap:anywhere]"
							>{log.ipAddress ?? '—'}</Table.Cell
						>
					</Table.Row>
				{/each}
				{#if data.logs.length === 0}
					<Table.Row>
						<Table.Cell colspan={6} class="py-12 text-center">
							<p class="font-medium text-muted-foreground">{m.audit_logs_no_results()}</p>
							<p class="text-sm text-muted-foreground">{m.audit_logs_no_results_hint()}</p>
						</Table.Cell>
					</Table.Row>
				{/if}
			</Table.Body>
		</Table.Root>
	</Card.Root>

	<!-- Pagination -->
	{#if data.pagination.total > 0}
		<div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
			<p class="text-sm text-muted-foreground">
				{m.audit_logs_total({ count: data.pagination.total })}
			</p>
			{#if data.pagination.totalPages > 1}
				<nav class="flex flex-wrap items-center gap-2" aria-label={m.pagination_label()}>
					{#if data.pagination.page > 1}
						<Button
							variant="outline"
							size="sm"
							class="min-h-10"
							href={listUrl(data.filters, data.pagination.page - 1)}
						>
							{m.common_previous()}
						</Button>
					{/if}
					<span class="text-sm text-muted-foreground" aria-current="page">
						{data.pagination.page} / {data.pagination.totalPages}
					</span>
					{#if data.pagination.page < data.pagination.totalPages}
						<Button
							variant="outline"
							size="sm"
							class="min-h-10"
							href={listUrl(data.filters, data.pagination.page + 1)}
						>
							{m.common_next()}
						</Button>
					{/if}
				</nav>
			{/if}
		</div>
	{/if}
</div>
