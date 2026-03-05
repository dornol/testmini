<script lang="ts">
	import { getContext } from 'svelte';
	import { SHORTCUTS_CONTEXT_KEY, formatShortcut, type ShortcutsContext, type RegisteredShortcut } from '$lib/shortcuts';

	interface Props {
		open: boolean;
	}

	let { open = $bindable() }: Props = $props();

	const ctx = getContext<ShortcutsContext>(SHORTCUTS_CONTEXT_KEY);

	type Category = 'Navigation' | 'Actions' | 'General';

	const categories: Category[] = ['Navigation', 'Actions', 'General'];

	function grouped(all: RegisteredShortcut[]): Record<Category, RegisteredShortcut[]> {
		const result: Record<Category, RegisteredShortcut[]> = {
			Navigation: [],
			Actions: [],
			General: [],
		};
		for (const s of all) {
			result[s.definition.category].push(s);
		}
		return result;
	}

	const allShortcuts = $derived(ctx?.manager.getAll() ?? []);
	const byCategory = $derived(grouped(allShortcuts));

	function close() {
		open = false;
	}

	function handleBackdropClick(e: MouseEvent) {
		if ((e.target as HTMLElement).dataset.backdrop) close();
	}

	function handleBackdropKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') close();
	}

	function handlePanelKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') close();
	}
</script>

{#if open}
	<div
		class="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
		data-backdrop="1"
		onclick={handleBackdropClick}
		onkeydown={handleBackdropKeydown}
		role="dialog"
		aria-modal="true"
		aria-label="Keyboard shortcuts"
		tabindex="-1"
	>
		<!-- Backdrop -->
		<div class="absolute inset-0 bg-black/40 backdrop-blur-sm" data-backdrop="1"></div>

		<!-- Panel -->
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<div
			class="relative z-10 w-full max-w-md rounded-xl border border-border bg-background/95 shadow-2xl backdrop-blur-md"
			role="document"
			onkeydown={handlePanelKeydown}
		>
			<!-- Header -->
			<div class="flex items-center justify-between border-b border-border px-5 py-3">
				<h2 class="text-sm font-semibold text-foreground">Keyboard Shortcuts</h2>
				<button
					onclick={close}
					aria-label="Close shortcuts panel"
					class="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M18 6 6 18" /><path d="m6 6 12 12" />
					</svg>
				</button>
			</div>

			<!-- Shortcut groups -->
			<div class="divide-y divide-border">
				{#each categories as category (category)}
					{#if byCategory[category].length > 0}
						<div class="px-5 py-3">
							<p class="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
								{category}
							</p>
							<ul class="space-y-1.5">
								{#each byCategory[category] as shortcut (shortcut.combo)}
									<li class="flex items-center justify-between gap-4">
										<span class="text-sm text-foreground">{shortcut.definition.label}</span>
										<span class="flex shrink-0 items-center gap-1">
											{#each formatShortcut(shortcut.combo).split(' ') as key (key)}
												<kbd class="inline-flex min-w-[1.5rem] items-center justify-center rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground shadow-sm">
													{key}
												</kbd>
											{/each}
										</span>
									</li>
								{/each}
							</ul>
						</div>
					{/if}
				{/each}
			</div>

			<!-- Footer hint -->
			<div class="border-t border-border px-5 py-2">
				<p class="text-center text-xs text-muted-foreground">
					Press <kbd class="inline-flex min-w-[1.5rem] items-center justify-center rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs shadow-sm">Esc</kbd> or click outside to close
				</p>
			</div>
		</div>
	</div>
{/if}
