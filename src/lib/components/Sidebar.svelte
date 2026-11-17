<script lang="ts">
	import { page } from '$app/state';
	import { MediaQuery, SvelteSet } from 'svelte/reactivity';
	import { afterNavigate } from '$app/navigation';
	import { cn } from '$lib/utils';
	import * as m from '$lib/paraglide/messages.js';
	import { Input } from '$lib/components/ui/input/index.js';

	let { open = $bindable(true) }: { open: boolean } = $props();
	const desktop = new MediaQuery('(min-width: 1024px)');

	afterNavigate(() => {
		open = false;
	});

	function handleEscape(event: KeyboardEvent) {
		if (event.key === 'Escape' && open && !desktop.current) {
			open = false;
			document.querySelector<HTMLButtonElement>('[aria-controls="app-sidebar"]')?.focus();
		}
	}

	type SidebarProject = {
		id: number;
		name: string;
		groups: { id: number; name: string; color: string | null }[];
	};

	const sidebarProjects = $derived(
		((page.data as Record<string, unknown>).sidebarProjects as SidebarProject[] | undefined) ?? []
	);

	const isAdmin = $derived(
		(page.data as Record<string, unknown>).user &&
			((page.data as Record<string, unknown>).user as Record<string, unknown>)?.role === 'admin'
	);

	// Extract current projectId from URL path like /projects/123/...
	const currentProjectId = $derived.by(() => {
		const match = page.url.pathname.match(/^\/projects\/(\d+)/);
		return match ? Number(match[1]) : null;
	});

	const expandedProjects = new SvelteSet<number>();
	let projectQuery = $state('');

	const visibleProjects = $derived.by(() => {
		const query = projectQuery.trim().toLocaleLowerCase();
		if (query) {
			return sidebarProjects
				.filter((project) => project.name.toLocaleLowerCase().includes(query))
				.slice(0, 30);
		}

		const current = sidebarProjects.find((project) => project.id === currentProjectId);
		const others = sidebarProjects.filter((project) => project.id !== currentProjectId);
		return current ? [current, ...others].slice(0, 10) : others.slice(0, 10);
	});

	const hiddenProjectCount = $derived(Math.max(0, sidebarProjects.length - visibleProjects.length));

	// Auto-expand the current project on navigation
	$effect(() => {
		if (currentProjectId !== null) {
			expandedProjects.add(currentProjectId);
		}
	});

	function toggleProject(id: number) {
		if (expandedProjects.has(id)) {
			expandedProjects.delete(id);
		} else {
			expandedProjects.add(id);
		}
	}

	function isActive(href: string): boolean {
		return page.url.pathname === href || page.url.pathname.startsWith(href + '/');
	}

	function isActiveWithQuery(href: string, query?: string): boolean {
		if (query) {
			return page.url.pathname === href && page.url.search === query;
		}
		return isActive(href);
	}

	function isProjectActive(projectId: number): boolean {
		return isActive(`/projects/${projectId}`);
	}
</script>

<svelte:window onkeydown={handleEscape} />

{#if open}
	<!-- Overlay for mobile -->
	<button
		class="fixed inset-0 z-30 bg-black/50 lg:hidden"
		onclick={() => (open = false)}
		aria-label={m.aria_close_sidebar()}
	></button>
{/if}

<aside
	id="app-sidebar"
	inert={!desktop.current && !open}
	class={cn(
		'fixed left-0 top-14 z-40 flex h-[calc(100dvh-3.5rem)] w-60 flex-col border-r border-sidebar-border bg-sidebar transition-transform duration-200 lg:static lg:z-auto lg:translate-x-0',
		open ? 'translate-x-0' : '-translate-x-full'
	)}
>
	<nav class="flex-1 overflow-y-auto space-y-1 p-3" aria-label={m.aria_main_navigation()}>
		<a
			href="/my-work"
			aria-current={isActive('/my-work') ? 'page' : undefined}
			class={cn(
				'flex items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
				isActive('/my-work')
					? 'bg-sidebar-accent text-sidebar-accent-foreground'
					: 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
			)}
		>
			<svg
				width="18"
				height="18"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				aria-hidden="true"
			>
				<path d="M9 11l3 3L22 4" /><path
					d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"
				/>
			</svg>
			{m.my_work_title()}
		</a>

		<!-- Teams link -->
		<a
			href="/teams"
			aria-current={isActive('/teams') ? 'page' : undefined}
			class={cn(
				'flex items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
				page.url.pathname.startsWith('/teams')
					? 'bg-sidebar-accent text-sidebar-accent-foreground'
					: 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
			)}
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="18"
				height="18"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
				<circle cx="9" cy="7" r="4" />
				<path d="M22 21v-2a4 4 0 0 0-3-3.87" />
				<path d="M16 3.13a4 4 0 0 1 0 7.75" />
			</svg>
			{m.nav_teams()}
		</a>

		<!-- Projects header -->
		<a
			href="/projects"
			aria-current={page.url.pathname === '/projects' ? 'page' : undefined}
			class={cn(
				'flex items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
				page.url.pathname === '/projects'
					? 'bg-sidebar-accent text-sidebar-accent-foreground'
					: 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
			)}
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="18"
				height="18"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<path
					d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"
				/>
			</svg>
			{m.nav_projects()}
		</a>

		{#if sidebarProjects.length > 6}
			<div class="px-1.5 pt-1.5 pb-1">
				<Input
					bind:value={projectQuery}
					class="h-8 bg-background px-2 text-xs"
					placeholder={m.projects_search_placeholder()}
					aria-label={m.projects_search_placeholder()}
				/>
			</div>
		{/if}

		<!-- Project tree -->
		{#each visibleProjects as proj (proj.id)}
			<!-- Project row -->
			<button
				onclick={() => toggleProject(proj.id)}
				aria-expanded={expandedProjects.has(proj.id)}
				class={cn(
					'mt-0.5 flex w-full items-center gap-1.5 rounded-md px-3 py-2.5 text-sm font-medium transition-colors text-left',
					isProjectActive(proj.id)
						? 'bg-sidebar-accent text-sidebar-accent-foreground'
						: 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
				)}
			>
				<!-- Chevron -->
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="14"
					height="14"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					class={cn('shrink-0 transition-transform', expandedProjects.has(proj.id) && 'rotate-90')}
				>
					<path d="m9 18 6-6-6-6" />
				</svg>
				<span class="truncate">{proj.name}</span>
			</button>

			<!-- Expanded children -->
			{#if expandedProjects.has(proj.id)}
				<div class="ml-3 border-l border-sidebar-border pl-1">
					<!-- Test Cases -->
					<a
						href={`/projects/${proj.id}/test-cases`}
						class={cn(
							'flex items-center gap-1.5 rounded-md px-2.5 py-2 text-sm transition-colors',
							isActive(`/projects/${proj.id}/test-cases`)
								? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
								: 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
						)}
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="14"
							height="14"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
							<path d="M14 2v4a2 2 0 0 0 2 2h4" />
							<path d="M9 15h6" />
							<path d="M9 11h6" />
						</svg>
						{m.nav_test_cases()}
					</a>

					<!-- Groups -->
					{#each proj.groups as group (group.id)}
						<a
							href={`/projects/${proj.id}/test-cases?groupId=${group.id}`}
							class={cn(
								'flex items-center gap-1.5 rounded-md px-2.5 py-2 text-sm transition-colors',
								isActiveWithQuery(`/projects/${proj.id}/test-cases`, `?groupId=${group.id}`)
									? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
									: 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
							)}
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="14"
								height="14"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
							>
								<path
									d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"
								/>
							</svg>
							{#if group.color}
								<span
									class="inline-block h-2 w-2 shrink-0 rounded-full"
									style="background-color: {group.color}"
								></span>
							{/if}
							<span class="truncate">{group.name}</span>
						</a>
					{/each}

					<!-- Test Runs -->
					<a
						href={`/projects/${proj.id}/test-runs`}
						class={cn(
							'flex items-center gap-1.5 rounded-md px-2.5 py-2 text-sm transition-colors',
							isActive(`/projects/${proj.id}/test-runs`)
								? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
								: 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
						)}
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="14"
							height="14"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
							<path d="M3 3v5h5" />
							<path d="M12 7v5l4 2" />
						</svg>
						{m.nav_test_runs()}
					</a>

					<!-- Reports -->
					<a
						href={`/projects/${proj.id}/reports`}
						class={cn(
							'flex items-center gap-1.5 rounded-md px-2.5 py-2 text-sm transition-colors',
							isActive(`/projects/${proj.id}/reports`)
								? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
								: 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
						)}
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="14"
							height="14"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<path d="M3 3v16a2 2 0 0 0 2 2h16" />
							<path d="M7 16l4-8 4 4 4-6" />
						</svg>
						{m.nav_reports()}
					</a>
				</div>
			{/if}
		{/each}

		{#if projectQuery.trim() && visibleProjects.length === 0}
			<p class="text-muted-foreground px-2.5 py-3 text-center text-xs">{m.common_no_results()}</p>
		{:else if !projectQuery.trim() && hiddenProjectCount > 0}
			<a
				href="/projects"
				class="text-muted-foreground hover:text-foreground mt-1 block px-2.5 py-1.5 text-xs"
			>
				{m.projects_all()} (+{hiddenProjectCount})
			</a>
		{/if}
	</nav>

	{#if isAdmin}
		<div class="border-t border-sidebar-border p-2">
			<a
				href="/admin"
				class={cn(
					'flex items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
					isActive('/admin')
						? 'bg-sidebar-accent text-sidebar-accent-foreground'
						: 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
				)}
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="18"
					height="18"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<path
						d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
					/>
					<circle cx="12" cy="12" r="3" />
				</svg>
				{m.nav_admin()}
			</a>
		</div>
	{/if}
</aside>
