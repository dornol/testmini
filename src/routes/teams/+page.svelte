<script lang="ts">
	import { afterNavigate, goto } from '$app/navigation';
	import { navigating } from '$app/state';
	import { untrack } from 'svelte';
	import * as m from '$lib/paraglide/messages.js';
	import PageHeader from '$lib/components/patterns/PageHeader.svelte';
	import FilterToolbar from '$lib/components/patterns/FilterToolbar.svelte';
	import EmptyState from '$lib/components/patterns/EmptyState.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';

	let { data } = $props();
	let search = $state(untrack(() => data.search));
	let searchField = $state<HTMLInputElement | null>(null);
	let restoreSearchFocus = false;
	const loading = $derived(navigating.to?.url.pathname === '/teams');

	afterNavigate(() => {
		search = data.search;
		if (restoreSearchFocus) {
			restoreSearchFocus = false;
			searchField?.focus();
		}
	});

	function submitSearch(event: SubmitEvent) {
		event.preventDefault();
		const query = search.trim();
		if (query === data.search) {
			search = query;
			return;
		}
		const suffix = query ? `?${new URLSearchParams({ search: query })}` : '';
		void goto('/teams' + suffix, { keepFocus: true, noScroll: true });
	}
</script>

<div class="space-y-4">
	<PageHeader title={m.team_title()} level={1}>
		{#snippet actions()}<Button href="/teams/new" class="w-full sm:w-auto">{m.team_new()}</Button
			>{/snippet}
	</PageHeader>

	<FilterToolbar label={m.team_search()}>
		<form
			action="/teams"
			method="GET"
			onsubmit={submitSearch}
			class="flex min-w-0 flex-1 flex-wrap items-center gap-2"
		>
			<Input
				type="search"
				name="search"
				bind:ref={searchField}
				bind:value={search}
				maxlength={100}
				aria-label={m.team_search()}
				placeholder={m.team_search()}
				class="min-w-0 flex-1 basis-40"
			/>
			<Button type="submit" variant="outline">{m.common_search()}</Button>
			{#if data.search}
				<Button
					href="/teams"
					variant="ghost"
					data-sveltekit-noscroll
					onclick={(event) => {
						if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey)
							restoreSearchFocus = true;
					}}>{m.projects_clear_search()}</Button
				>
			{/if}
		</form>
	</FilterToolbar>

	<p role="status" class="text-sm text-muted-foreground">
		{loading ? m.common_loading() : m.team_results_count({ count: data.teams.length })}
	</p>
	{#if data.teams.length === 0}
		<EmptyState
			title={data.search ? m.ui_no_filtered_results() : m.team_empty_title()}
			description={data.search ? m.team_no_search_results() : m.team_empty_create()}
		/>
	{:else}
		<ul aria-label={m.team_title()} class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{#each data.teams as team (team.id)}
				<li class="min-w-0">
					<a
						href={'/teams/' + team.id}
						aria-labelledby={`team-name-${team.id}`}
						class="flex h-full min-w-0 flex-col gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:p-5"
					>
						<h2
							id={`team-name-${team.id}`}
							class="text-lg font-semibold leading-snug [overflow-wrap:anywhere]"
						>
							{team.name}
						</h2>
						{#if team.description}
							<p
								class="line-clamp-2 whitespace-pre-line text-sm text-muted-foreground [overflow-wrap:anywhere]"
							>
								{team.description}
							</p>
						{/if}
						<dl
							class="mt-auto flex flex-wrap gap-x-4 gap-y-1 border-t pt-3 text-sm text-muted-foreground"
						>
							<div class="flex items-baseline gap-1">
								<dt>{m.team_members()}</dt>
								<dd class="font-medium text-foreground">{team.memberCount}</dd>
							</div>
							<div class="flex items-baseline gap-1">
								<dt>{m.team_projects()}</dt>
								<dd class="font-medium text-foreground">{team.projectCount}</dd>
							</div>
						</dl>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</div>
