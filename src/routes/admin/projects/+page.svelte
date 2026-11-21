<script lang="ts">
	import { tick } from 'svelte';
	import type { SubmitFunction } from '@sveltejs/kit';
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

	type Project = (typeof data.projects)[number];

	// Follows the URL, but stays editable while typing.
	let searchInput = $derived(data.search);
	let searchEl = $state<HTMLInputElement | null>(null);

	let target = $state<Project | null>(null);
	let open = $state(false);
	let pending = $state(false);
	let done = $state(false);
	let error = $state('');
	let errorEl = $state<HTMLElement | null>(null);

	function listUrl({
		search = data.search,
		inactive = data.showInactive,
		pageNo = 1
	}: { search?: string; inactive?: boolean; pageNo?: number } = {}) {
		const params = new URLSearchParams();
		if (search) params.set('search', search);
		if (inactive) params.set('inactive', 'true');
		if (pageNo > 1) params.set('page', String(pageNo));
		const query = params.toString();
		return query ? `/admin/projects?${query}` : '/admin/projects';
	}

	function confirmToggle(project: Project) {
		target = project;
		error = '';
		done = false;
		open = true;
	}

	function failureMessage(serverError: unknown) {
		return serverError === 'Project not found'
			? m.admin_project_not_found()
			: m.error_operation_failed();
	}

	const submit: SubmitFunction = ({ cancel }) => {
		if (pending) {
			cancel();
			return;
		}
		pending = true;
		error = '';
		return async ({ result }) => {
			try {
				if (result.type === 'success') {
					done = true;
					open = false;
					await invalidateAll();
					toast.success(m.admin_updated());
				} else {
					const serverError = result.type === 'failure' ? result.data?.error : undefined;
					error = failureMessage(serverError);
					if (serverError === 'Project not found') await invalidateAll();
					await tick();
					errorEl?.focus();
				}
			} finally {
				pending = false;
			}
		};
	};

	// The row may disappear from the filtered list, so land on the search field instead of <body>.
	function restoreFocus(event: Event) {
		if (!done) return;
		event.preventDefault();
		searchEl?.focus();
	}
</script>

{#snippet toggle(p: Project)}
	{@const label = p.active ? m.admin_projects_deactivate() : m.admin_projects_activate()}
	<Button
		type="button"
		variant="ghost"
		size="sm"
		class="min-h-10 px-2 text-xs {p.active
			? 'text-destructive'
			: 'text-green-700 dark:text-green-400'}"
		aria-label={m.admin_project_action_label({ name: p.name, action: label })}
		onclick={() => confirmToggle(p)}>{label}</Button
	>
{/snippet}

{#snippet status(p: Project)}
	<Badge variant={p.active ? 'default' : 'secondary'}>
		{p.active ? m.common_active() : m.common_inactive()}
	</Badge>
{/snippet}

<div class="space-y-4">
	<!-- Search & Filters -->
	<div class="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
		<form
			onsubmit={(e) => {
				e.preventDefault();
				goto(listUrl({ search: searchInput.trim() }));
			}}
			class="flex flex-col gap-2 sm:flex-row"
		>
			<Input
				type="search"
				name="search"
				maxlength={100}
				placeholder={m.admin_projects_search()}
				class="w-full sm:max-w-sm"
				bind:ref={searchEl}
				bind:value={searchInput}
				aria-label={m.admin_projects_search()}
			/>
			<Button type="submit" variant="outline" class="min-h-10 w-full sm:w-auto"
				>{m.common_search()}</Button
			>
		</form>
		<Button
			type="button"
			variant={data.showInactive ? 'default' : 'outline'}
			aria-pressed={data.showInactive}
			class="min-h-10 w-full sm:w-auto"
			onclick={() => goto(listUrl({ inactive: !data.showInactive }))}
		>
			{m.admin_projects_show_inactive()}
		</Button>
	</div>

	<!-- Mobile projects list -->
	<div class="space-y-3 sm:hidden">
		{#each data.projects as proj (proj.id)}
			<Card.Root class="gap-3 rounded-lg p-4">
				<div class="min-w-0 space-y-1">
					<a
						href="/projects/{proj.id}"
						class="block text-sm leading-snug font-semibold text-primary [overflow-wrap:anywhere] hover:underline"
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
					{@render status(proj)}
					{@render toggle(proj)}
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
		<Table.Root class="table-fixed" aria-label={m.nav_projects()}>
			<Table.Header>
				<Table.Row>
					<Table.Head class="w-16">{m.admin_projects_id()}</Table.Head>
					<Table.Head>{m.common_name()}</Table.Head>
					<Table.Head class="w-24">{m.common_status()}</Table.Head>
					<Table.Head class="w-24">{m.dashboard_members()}</Table.Head>
					<Table.Head class="hidden w-32 md:table-cell">{m.common_created()}</Table.Head>
					<Table.Head class="w-32">{m.common_actions()}</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each data.projects as proj (proj.id)}
					<Table.Row>
						<Table.Cell class="text-muted-foreground">{proj.id}</Table.Cell>
						<Table.Cell class="whitespace-normal [overflow-wrap:anywhere]">
							<a href="/projects/{proj.id}" class="font-medium text-primary hover:underline">
								{proj.name}
							</a>
						</Table.Cell>
						<Table.Cell>{@render status(proj)}</Table.Cell>
						<Table.Cell>{proj.memberCount}</Table.Cell>
						<Table.Cell class="hidden text-xs text-muted-foreground md:table-cell">
							{new Date(proj.createdAt).toLocaleDateString()}
						</Table.Cell>
						<Table.Cell>{@render toggle(proj)}</Table.Cell>
					</Table.Row>
				{/each}
				{#if data.projects.length === 0}
					<Table.Row>
						<Table.Cell colspan={6} class="py-12 text-center">
							<p class="font-medium text-muted-foreground">{m.admin_projects_no_results()}</p>
							<p class="text-sm text-muted-foreground">{m.admin_projects_no_results_hint()}</p>
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
				{m.admin_projects_total({ count: data.pagination.total })}
			</p>
			{#if data.pagination.totalPages > 1}
				<nav class="flex flex-wrap items-center gap-2" aria-label={m.pagination_label()}>
					{#if data.pagination.page > 1}
						<Button
							variant="outline"
							size="sm"
							class="min-h-10"
							href={listUrl({ pageNo: data.pagination.page - 1 })}
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
							href={listUrl({ pageNo: data.pagination.page + 1 })}
						>
							{m.common_next()}
						</Button>
					{/if}
				</nav>
			{/if}
		</div>
	{/if}
</div>

<AlertDialog.Root bind:open>
	{#if target}
		<AlertDialog.Content
			onCloseAutoFocus={restoreFocus}
			escapeKeydownBehavior={pending ? 'ignore' : 'close'}
		>
			<AlertDialog.Header>
				<AlertDialog.Title>{m.admin_confirm_toggle_title()}</AlertDialog.Title>
				<AlertDialog.Description class="[overflow-wrap:anywhere]">
					{target.active
						? m.admin_confirm_deactivate({ name: target.name })
						: m.admin_confirm_activate({ name: target.name })}
				</AlertDialog.Description>
			</AlertDialog.Header>
			{#if error}
				<p role="alert" tabindex="-1" bind:this={errorEl} class="text-sm text-destructive">
					{error}
				</p>
			{/if}
			<AlertDialog.Footer>
				<AlertDialog.Cancel class="min-h-10 w-full sm:w-auto" disabled={pending}
					>{m.common_cancel()}</AlertDialog.Cancel
				>
				<form class="w-full sm:w-auto" method="POST" action="?/toggleActive" use:enhance={submit}>
					<input type="hidden" name="projectId" value={target.id} />
					<input type="hidden" name="active" value={target.active ? 'false' : 'true'} />
					<Button
						type="submit"
						variant={target.active ? 'destructive' : 'default'}
						class="min-h-10 w-full sm:w-auto"
						disabled={pending}
					>
						{pending
							? m.common_saving()
							: target.active
								? m.admin_projects_deactivate()
								: m.admin_projects_activate()}
					</Button>
				</form>
			</AlertDialog.Footer>
		</AlertDialog.Content>
	{/if}
</AlertDialog.Root>
