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

	let open = $state(false);
	let query = $state('');
	let loading = $state(false);
	let results = $state<SearchResult[]>([]);
	let selectedIndex = $state(0);
	let searchTimer: ReturnType<typeof setTimeout> | undefined;

	const projectId = $derived(
		Number(page.url.pathname.match(/^\/projects\/(\d+)/)?.[1] ?? Number.NaN)
	);
	const canSearch = $derived(Number.isSafeInteger(projectId) && projectId > 0);

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
		open = true;
		query = '';
		results = [];
		selectedIndex = 0;
	}

	function closePalette() {
		open = false;
		query = '';
		results = [];
	}

	function selectResult(result: SearchResult) {
		closePalette();
		goto(result.url);
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
		class="fixed left-1/2 top-16 z-[101] w-[min(640px,calc(100vw-24px))] -translate-x-1/2 overflow-hidden rounded-lg border bg-popover shadow-xl"
		role="dialog"
		aria-modal="true"
		aria-label={m.command_palette_title()}
	>
		<input
			use:focusOnMount
			class="h-12 w-full border-b bg-transparent px-4 text-sm outline-none"
			placeholder={m.command_palette_placeholder()}
			bind:value={query}
		/>
		<div class="max-h-[420px] overflow-y-auto p-1">
			{#if !canSearch}
				<div class="px-3 py-8 text-center text-sm text-muted-foreground">
					{m.command_palette_project_required()}
				</div>
			{:else if query.trim().length < 2}
				<div class="px-3 py-8 text-center text-sm text-muted-foreground">
					{m.command_palette_min_query()}
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
				{#each results as result, i (`${result.type}-${result.id}`)}
					<button
						type="button"
						class="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-accent {i ===
						selectedIndex
							? 'bg-accent'
							: ''}"
						onmouseenter={() => (selectedIndex = i)}
						onclick={() => selectResult(result)}
					>
						<span class="min-w-0">
							<span class="block truncate font-medium">{result.title}</span>
							{#if result.subtitle}
								<span class="block truncate text-xs text-muted-foreground">{result.subtitle}</span>
							{/if}
						</span>
						<span
							class="ml-3 shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
						>
							{resultTypeLabel(result.type)}
						</span>
					</button>
				{/each}
			{/if}
		</div>
	</div>
{/if}
