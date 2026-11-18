<script lang="ts">
	import { afterNavigate, beforeNavigate, goto } from '$app/navigation';
	import { navigating, page } from '$app/state';
	import { onDestroy, untrack } from 'svelte';
	import * as m from '$lib/paraglide/messages.js';
	import { getLocale } from '$lib/paraglide/runtime.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import PageHeader from '$lib/components/patterns/PageHeader.svelte';
	import FilterToolbar from '$lib/components/patterns/FilterToolbar.svelte';
	import EmptyState from '$lib/components/patterns/EmptyState.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let searchInput = $state(untrack(() => data.search));
	let searchField = $state<HTMLInputElement | null>(null);
	let timer: ReturnType<typeof setTimeout> | undefined;
	let focusAfterClear = false;
	const loading = $derived(navigating.to?.url.pathname === '/projects');

	function cancelSearch() {
		clearTimeout(timer);
		timer = undefined;
	}

	beforeNavigate(cancelSearch);
	onDestroy(cancelSearch);
	afterNavigate(() => {
		if (!timer) searchInput = data.search;
		if (focusAfterClear) {
			focusAfterClear = false;
			searchField?.focus();
		}
	});

	function listUrl(search: string, active: boolean, targetPage = 1) {
		const params = new URLSearchParams(page.url.searchParams);
		if (search.trim()) params.set('search', search.trim());
		else params.delete('search');
		if (active) params.delete('active');
		else params.set('active', 'false');
		if (targetPage === 1) params.delete('page');
		else params.set('page', String(targetPage));
		return `/projects${params.size ? `?${params}` : ''}`;
	}

	const passthrough = $derived(
		[...page.url.searchParams].filter(([key]) => !['search', 'page', 'active'].includes(key))
	);

	function applySearch() {
		cancelSearch();
		if (searchInput.trim() === data.search) return;
		void goto(listUrl(searchInput, data.active), { keepFocus: true, noScroll: true });
	}

	function queueSearch() {
		cancelSearch();
		if (!navigating.to || navigating.to.url.pathname === '/projects') {
			timer = setTimeout(applySearch, 300);
		}
	}

	function submitSearch(event: SubmitEvent) {
		event.preventDefault();
		applySearch();
	}

	function formatDate(date: Date | string) {
		return new Date(date).toLocaleDateString(getLocale(), { dateStyle: 'medium' });
	}
</script>

{#snippet card(project: PageData['projects'][number])}
	<Card.Root class="h-full transition-colors group-hover:border-primary/40">
		<Card.Header>
			<div class="flex flex-wrap items-start justify-between gap-2">
				<h3
					id={`project-list-title-${project.id}`}
					class="min-w-0 text-lg font-semibold leading-snug [overflow-wrap:anywhere]"
				>
					{project.name}
				</h3>
				{#if !project.active}<Badge variant="secondary">{m.common_inactive()}</Badge>{/if}
			</div>
			{#if project.description}
				<Card.Description class="line-clamp-2 [overflow-wrap:anywhere]"
					>{project.description}</Card.Description
				>
			{/if}
		</Card.Header>
		<Card.Footer
			class="mt-auto flex flex-wrap gap-x-4 gap-y-1 border-t pt-4 text-sm text-muted-foreground"
		>
			<span>{m.projects_members_count({ count: project.memberCount })}</span>
			<time datetime={new Date(project.createdAt).toISOString()}
				>{formatDate(project.createdAt)}</time
			>
		</Card.Footer>
	</Card.Root>
{/snippet}

<div class="space-y-4">
	<PageHeader title={m.projects_title()} level={1}>
		{#snippet actions()}<Button href="/projects/new">{m.projects_new()}</Button>{/snippet}
	</PageHeader>

	<FilterToolbar label={m.ui_filters()}>
		<form
			method="GET"
			action="/projects"
			onsubmit={submitSearch}
			class="flex min-w-0 flex-1 basis-full flex-wrap items-center gap-2 sm:basis-auto"
		>
			{#if !data.active}<input type="hidden" name="active" value="false" />{/if}
			{#each passthrough as [name, value]}<input type="hidden" {name} {value} />{/each}
			<Input
				name="search"
				type="search"
				placeholder={m.projects_search_placeholder()}
				bind:value={searchInput}
				bind:ref={searchField}
				oninput={queueSearch}
				aria-label={m.projects_search_placeholder()}
				class="min-w-0 flex-1 basis-36"
			/>
			{#if data.search}
				<Button
					href={listUrl('', data.active)}
					variant="ghost"
					data-sveltekit-noscroll
					onclick={(event) => {
						if (
							event.button === 0 &&
							!event.metaKey &&
							!event.ctrlKey &&
							!event.shiftKey &&
							!event.altKey
						)
							focusAfterClear = true;
					}}>{m.projects_clear_search()}</Button
				>
			{/if}
		</form>
		<nav aria-label={m.projects_status_filter()} class="flex flex-wrap gap-1">
			{#each [true, false] as active (active)}
				<Button
					href={listUrl(searchInput, active)}
					variant={data.active === active ? 'secondary' : 'outline'}
					aria-current={data.active === active ? 'page' : undefined}
					data-sveltekit-noscroll
					data-sveltekit-keepfocus
				>
					{active ? m.projects_active_tab() : m.projects_inactive_tab()}
				</Button>
			{/each}
		</nav>
	</FilterToolbar>

	<section aria-labelledby="projects-results" class="space-y-3">
		<div class="flex flex-wrap items-baseline justify-between gap-2">
			<h2 id="projects-results" class="text-lg font-semibold">{m.projects_results()}</h2>
			<p role="status" class="text-sm text-muted-foreground">
				{loading ? m.common_loading() : m.projects_result_count({ count: data.meta.total })}
			</p>
		</div>
		{#if !data.active && data.canManageInactive}
			<Button
				variant="outline"
				href={`/admin/projects?${new URLSearchParams({ inactive: 'true', ...(data.search ? { search: data.search } : {}) })}`}
			>
				{m.projects_manage_inactive()}
			</Button>
		{/if}

		<div aria-busy={loading} class="space-y-3">
			{#if !data.projects.length}
				<EmptyState
					title={data.search
						? m.ui_no_filtered_results()
						: data.active
							? m.projects_empty_title()
							: m.projects_empty_inactive()}
					description={data.search
						? m.projects_empty_search()
						: data.active
							? m.projects_empty_create()
							: m.projects_empty_inactive_description()}
				/>
			{:else}
				<ul class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{#each data.projects as project (project.id)}
						<li class="min-w-0">
							{#if project.active}
								<a
									href={`/projects/${project.id}`}
									aria-labelledby={`project-list-title-${project.id}`}
									class="group block h-full min-w-0 rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
								>
									{@render card(project)}
								</a>
							{:else}
								{@render card(project)}
							{/if}
						</li>
					{/each}
				</ul>
				{#if data.meta.totalPages > 1}
					<nav
						aria-label={m.projects_pagination()}
						class="flex flex-wrap items-center justify-center gap-2"
					>
						<Button
							variant="outline"
							href={listUrl(data.search, data.active, data.meta.page - 1)}
							disabled={data.meta.page <= 1}
						>
							{m.common_previous()}
						</Button>
						<span class="px-2 text-sm tabular-nums text-muted-foreground">
							{m.common_page_of({ page: data.meta.page, totalPages: data.meta.totalPages })}
						</span>
						<Button
							variant="outline"
							href={listUrl(data.search, data.active, data.meta.page + 1)}
							disabled={data.meta.page >= data.meta.totalPages}
						>
							{m.common_next()}
						</Button>
					</nav>
				{/if}
			{/if}
		</div>
	</section>
</div>
