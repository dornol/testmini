<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { apiFetch } from '$lib/api-client';
	import * as m from '$lib/paraglide/messages.js';

	type SearchResult = {
		type: string;
		id: number;
		title: string;
		subtitle: string | null;
		url: string;
	};
	type SidebarProject = { id: number; name: string };
	type QuickAction = { label: string; url: string };

	let open = $state(false);
	let query = $state('');
	let loading = $state(false);
	let results = $state<SearchResult[]>([]);
	let selectedIndex = $state(0);
	let searchTimer: ReturnType<typeof setTimeout> | undefined;
	let dialogElement = $state<HTMLDivElement>();
	let returnFocusTo: HTMLElement | null = null;

	const projectId = $derived(
		Number(page.url.pathname.match(/^\/projects\/(\d+)/)?.[1] ?? Number.NaN)
	);
	const canSearch = $derived(Number.isSafeInteger(projectId) && projectId > 0);
	const projects = $derived(
		((page.data as Record<string, unknown>).sidebarProjects as SidebarProject[] | undefined) ?? []
	);
	const visibleProjects = $derived(
		projects
			.filter((project) =>
				project.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
			)
			.slice(0, 8)
	);
	const quickActions = $derived<QuickAction[]>(
		canSearch
			? [
					{ label: m.my_work_title(), url: '/my-work' },
					{
						label: m.command_palette_new_test_case(),
						url: `/projects/${projectId}/test-cases/new`
					},
					{ label: m.command_palette_new_test_run(), url: `/projects/${projectId}/test-runs/new` },
					{ label: m.command_palette_project_dashboard(), url: `/projects/${projectId}` },
					{ label: m.projects_all(), url: '/projects' }
				]
			: [
					{ label: m.my_work_title(), url: '/my-work' },
					{ label: m.projects_all(), url: '/projects' }
				]
	);

	$effect(() => {
		if (!open) return;
		clearTimeout(searchTimer);
		selectedIndex = 0;
		if (!canSearch || query.trim().length < 2) {
			results = [];
			loading = false;
			return;
		}
		loading = true;
		searchTimer = setTimeout(async () => {
			try {
				const data = await apiFetch<{ results: SearchResult[] }>(
					`/api/projects/${projectId}/search?q=${encodeURIComponent(query.trim())}`,
					{ silent: true }
				);
				results = data.results;
			} catch {
				results = [];
			} finally {
				loading = false;
			}
		}, 150);
		return () => clearTimeout(searchTimer);
	});

	function openPalette() {
		returnFocusTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		open = true;
		query = '';
		results = [];
		selectedIndex = 0;
	}

	function closePalette() {
		open = false;
		query = '';
		results = [];
		queueMicrotask(() => returnFocusTo?.focus());
	}

	function selectResult(result: SearchResult) {
		closePalette();
		goto(result.url);
	}

	function selectUrl(url: string) {
		closePalette();
		goto(url);
	}

	function resultTypeLabel(type: string): string {
		switch (type) {
			case 'test_case':
				return m.nav_test_cases();
			case 'test_run':
				return m.nav_test_runs();
			case 'requirement':
				return m.req_title();
			case 'test_plan':
				return m.nav_test_plans();
			case 'release':
				return m.nav_releases();
			default:
				return type.replace('_', ' ');
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (!open) return;
		if (event.key === 'Escape') {
			event.preventDefault();
			closePalette();
		} else if (event.key === 'Tab' && dialogElement) {
			const focusable = Array.from(
				dialogElement.querySelectorAll<HTMLElement>(
					'input:not([disabled]), button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
				)
			);
			const first = focusable[0];
			const last = focusable.at(-1);
			if (first && last && event.shiftKey && document.activeElement === first) {
				event.preventDefault();
				last.focus();
			} else if (first && last && !event.shiftKey && document.activeElement === last) {
				event.preventDefault();
				first.focus();
			}
		} else if (event.key === 'ArrowDown') {
			event.preventDefault();
			selectedIndex = Math.min(selectedIndex + 1, Math.max(results.length - 1, 0));
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			selectedIndex = Math.max(selectedIndex - 1, 0);
		} else if (event.key === 'Enter' && results[selectedIndex]) {
			event.preventDefault();
			selectResult(results[selectedIndex]);
		}
	}

	function focusOnMount(node: HTMLInputElement) {
		node.focus();
	}

	$effect(() => {
		window.addEventListener('testmini:open-command-palette', openPalette);
		return () => window.removeEventListener('testmini:open-command-palette', openPalette);
	});
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
	<button
		type="button"
		class="fixed inset-0 z-[100] bg-background/70 backdrop-blur-sm"
		aria-label={m.common_close()}
		onclick={closePalette}
	></button>
	<div
		bind:this={dialogElement}
		class="fixed left-1/2 top-3 z-[101] flex max-h-[calc(100dvh-1.5rem)] w-[min(640px,calc(100vw-24px))] -translate-x-1/2 flex-col overflow-hidden rounded-lg border bg-popover shadow-xl sm:top-16 sm:max-h-[calc(100dvh-5rem)]"
		role="dialog"
		aria-modal="true"
		aria-label={m.command_palette_title()}
	>
		<input
			use:focusOnMount
			class="h-12 w-full border-b bg-transparent px-4 text-sm outline-none"
			placeholder={m.command_palette_placeholder()}
			role="combobox"
			aria-expanded="true"
			aria-controls="command-palette-results"
			aria-autocomplete="list"
			aria-activedescendant={results[selectedIndex]
				? `command-palette-result-${results[selectedIndex].type}-${results[selectedIndex].id}`
				: undefined}
			bind:value={query}
		/>
		<div id="command-palette-results" class="min-h-0 flex-1 overflow-y-auto p-1">
			{#if !canSearch}
				<div class="px-2 py-2">
					<p class="px-2 pb-1 text-xs font-medium text-muted-foreground">
						{m.command_palette_switch_project()}
					</p>
					{#each visibleProjects as project (project.id)}
						<button
							type="button"
							class="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
							onclick={() => selectUrl(`/projects/${project.id}`)}
						>
							{project.name}
						</button>
					{/each}
					{#if visibleProjects.length === 0}
						<p class="px-3 py-6 text-center text-sm text-muted-foreground">
							{m.command_palette_no_results()}
						</p>
					{/if}
				</div>
			{:else if query.trim().length < 2}
				<div class="px-2 py-2">
					<p class="px-2 pb-1 text-xs font-medium text-muted-foreground">
						{m.command_palette_quick_actions()}
					</p>
					{#each quickActions as action (action.url)}
						<button
							type="button"
							class="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
							onclick={() => selectUrl(action.url)}
						>
							{action.label}
						</button>
					{/each}
				</div>
			{:else if loading}
				<div class="px-3 py-8 text-center text-sm text-muted-foreground">
					{m.common_loading()}
				</div>
			{:else if results.length === 0}
				<div class="px-3 py-8 text-center text-sm text-muted-foreground">
					{m.command_palette_no_results()}
				</div>
			{:else}
				<div role="listbox">
					{#each results as result, i (`${result.type}-${result.id}`)}
						<button
							id={`command-palette-result-${result.type}-${result.id}`}
							role="option"
							aria-selected={i === selectedIndex}
							type="button"
							class="flex w-full items-start justify-between gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-accent {i ===
							selectedIndex
								? 'bg-accent'
								: ''}"
							onmouseenter={() => (selectedIndex = i)}
							onclick={() => selectResult(result)}
						>
							<span class="min-w-0 flex-1">
								<span class="block truncate font-medium">{result.title}</span>
								{#if result.subtitle}
									<span class="block truncate text-xs text-muted-foreground">{result.subtitle}</span
									>
								{/if}
							</span>
							<span
								class="max-w-[40%] shrink-0 break-words rounded bg-muted px-1.5 py-0.5 text-right text-xs leading-tight text-muted-foreground"
							>
								{resultTypeLabel(result.type)}
							</span>
						</button>
					{/each}
				</div>
			{/if}
		</div>
	</div>
{/if}
