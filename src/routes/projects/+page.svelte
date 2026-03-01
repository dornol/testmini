<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import * as m from '$lib/paraglide/messages.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';

	let { data } = $props();

	let searchInput = $state(data.search);
	let searchTimeout: ReturnType<typeof setTimeout>;

	$effect(() => {
		searchInput = data.search;
	});

	function handleSearch() {
		clearTimeout(searchTimeout);
		searchTimeout = setTimeout(() => {
			const params = new URLSearchParams(page.url.searchParams);
			if (searchInput) {
				params.set('search', searchInput);
			} else {
				params.delete('search');
			}
			params.set('page', '1');
			goto(`/projects?${params.toString()}`, { keepFocus: true });
		}, 300);
	}

	function toggleActive() {
		const params = new URLSearchParams(page.url.searchParams);
		if (data.active) {
			params.set('active', 'false');
		} else {
			params.delete('active');
		}
		params.set('page', '1');
		goto(`/projects?${params.toString()}`);
	}

	function goToPage(p: number) {
		const params = new URLSearchParams(page.url.searchParams);
		params.set('page', String(p));
		goto(`/projects?${params.toString()}`);
	}
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-bold">{m.projects_title()}</h1>
		<Button href="/projects/new">{m.projects_new()}</Button>
	</div>

	<div class="flex items-center gap-3">
		<Input
			placeholder={m.projects_search_placeholder()}
			class="max-w-sm"
			bind:value={searchInput}
			oninput={handleSearch}
		/>
		<Button variant={data.active ? 'outline' : 'secondary'} size="sm" onclick={toggleActive}>
			{data.active ? m.projects_show_inactive() : m.projects_show_active()}
		</Button>
	</div>

	{#if data.projects.length === 0}
		<div class="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
			<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground mb-4">
				<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
			</svg>
			<h3 class="text-lg font-semibold">{m.projects_empty_title()}</h3>
			<p class="text-muted-foreground mt-1 text-sm">
				{#if data.search}
					{m.projects_empty_search()}
				{:else}
					{m.projects_empty_create()}
				{/if}
			</p>
			{#if !data.search}
				<Button href="/projects/new" class="mt-4">{m.projects_create()}</Button>
			{/if}
		</div>
	{:else}
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{#each data.projects as proj (proj.id)}
				<a href="/projects/{proj.id}" class="block">
					<Card.Root class="transition-shadow hover:shadow-md">
						<Card.Header>
							<div class="flex items-start justify-between">
								<Card.Title class="text-lg">{proj.name}</Card.Title>
								{#if !proj.active}
									<Badge variant="secondary">{m.common_inactive()}</Badge>
								{/if}
							</div>
							{#if proj.description}
								<Card.Description class="line-clamp-2">{proj.description}</Card.Description>
							{/if}
						</Card.Header>
						<Card.Footer class="text-muted-foreground text-sm">
							<div class="flex items-center gap-4">
								<span class="flex items-center gap-1">
									<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
										<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
										<circle cx="9" cy="7" r="4" />
										<path d="M22 21v-2a4 4 0 0 0-3-3.87" />
										<path d="M16 3.13a4 4 0 0 1 0 7.75" />
									</svg>
									{m.projects_members_count({ count: proj.memberCount })}
								</span>
								<span>
									{new Date(proj.createdAt).toLocaleDateString()}
								</span>
							</div>
						</Card.Footer>
					</Card.Root>
				</a>
			{/each}
		</div>

		<!-- Pagination -->
		{#if data.meta.totalPages > 1}
			<div class="flex items-center justify-center gap-2">
				<Button
					variant="outline"
					size="sm"
					disabled={data.meta.page <= 1}
					onclick={() => goToPage(data.meta.page - 1)}
				>
					{m.common_previous()}
				</Button>
				<span class="text-muted-foreground text-sm">
					Page {data.meta.page} of {data.meta.totalPages}
				</span>
				<Button
					variant="outline"
					size="sm"
					disabled={data.meta.page >= data.meta.totalPages}
					onclick={() => goToPage(data.meta.page + 1)}
				>
					{m.common_next()}
				</Button>
			</div>
		{/if}
	{/if}
</div>
