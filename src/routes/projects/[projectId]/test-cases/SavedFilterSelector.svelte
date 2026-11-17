<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import * as m from '$lib/paraglide/messages.js';
	import { toast } from 'svelte-sonner';
	import { apiPost, apiPatch, apiDelete } from '$lib/api-client';

	interface SavedFilterItem {
		id: number;
		name: string;
		filters: Record<string, unknown>;
		filterType: string;
	}

	interface Props {
		projectId: number;
		savedFilters: SavedFilterItem[];
		hasActiveFilters: boolean;
		basePath: string;
	}

	let { projectId, savedFilters, hasActiveFilters, basePath }: Props = $props();

	let saving = $state(false);
	let newViewName = $state('');
	let showSaveInput = $state(false);
	let renamingId = $state<number | null>(null);
	let renamingValue = $state('');
	let confirmDeleteId = $state<number | null>(null);

	function getCurrentFilters(): Record<string, unknown> {
		const filters: Record<string, unknown> = {};
		for (const [key, value] of page.url.searchParams.entries()) {
			if (key === 'page') continue;
			if (value) filters[key] = value;
		}
		return filters;
	}

	function applyFilter(filter: SavedFilterItem) {
		const params = new URLSearchParams();
		for (const [key, value] of Object.entries(filter.filters)) {
			if (value !== null && value !== undefined && value !== '') {
				params.set(key, String(value));
			}
		}
		const qs = params.toString();
		goto(qs ? `${basePath}?${qs}` : basePath);
	}

	async function saveCurrentFilters() {
		const name = newViewName.trim();
		if (!name || saving) return;
		saving = true;
		try {
			await apiPost(`/api/projects/${projectId}/saved-filters`, {
				name,
				filterType: 'test_cases',
				filters: getCurrentFilters()
			});
			toast.success(m.saved_view_saved());
			newViewName = '';
			showSaveInput = false;
			await invalidateAll();
		} catch {
			// error toast handled by apiPost
		} finally {
			saving = false;
		}
	}

	async function updateFilters(filter: SavedFilterItem) {
		try {
			await apiPatch(`/api/projects/${projectId}/saved-filters/${filter.id}`, {
				filters: getCurrentFilters()
			});
			toast.success(m.saved_view_updated());
			await invalidateAll();
		} catch {
			// error toast handled by apiPatch
		}
	}

	async function renameFilter(filter: SavedFilterItem) {
		const name = renamingValue.trim();
		if (!name) return;
		try {
			await apiPatch(`/api/projects/${projectId}/saved-filters/${filter.id}`, { name });
			toast.success(m.saved_view_updated());
			renamingId = null;
			renamingValue = '';
			await invalidateAll();
		} catch {
			// error toast handled by apiPatch
		}
	}

	async function deleteFilter(filterId: number) {
		try {
			await apiDelete(`/api/projects/${projectId}/saved-filters/${filterId}`);
			toast.success(m.saved_view_deleted());
			confirmDeleteId = null;
			await invalidateAll();
		} catch {
			// error toast handled by apiDelete
		}
	}
</script>

<Popover.Root>
	<Popover.Trigger>
		{#snippet child({ props })}
			<Button variant="outline" size="sm" class="h-8 px-2 text-xs" {...props}>
				{m.saved_view_title()}{savedFilters.length > 0 ? ` (${savedFilters.length})` : ''}
			</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content class="w-[calc(100vw-2rem)] max-w-sm p-2 sm:w-72" align="start">
		<div class="mb-2 text-xs font-medium text-muted-foreground">{m.saved_view_title()}</div>

		{#if savedFilters.length === 0 && !showSaveInput}
			<p class="px-2 py-3 text-center text-xs text-muted-foreground">{m.saved_view_empty()}</p>
		{/if}

		<div class="max-h-60 space-y-0.5 overflow-y-auto">
			{#each savedFilters as filter (filter.id)}
				{#if renamingId === filter.id}
					<div class="flex items-center gap-1 px-1 py-1">
						<Input
							class="h-6 text-xs flex-1"
							bind:value={renamingValue}
							onkeydown={(e) => {
								if (e.key === 'Enter') renameFilter(filter);
								if (e.key === 'Escape') {
									renamingId = null;
								}
							}}
						/>
						<Button
							variant="ghost"
							size="sm"
							class="h-6 px-1 text-xs"
							onclick={() => renameFilter(filter)}
						>
							{m.common_save_changes()}
						</Button>
					</div>
				{:else if confirmDeleteId === filter.id}
					<div class="rounded border border-destructive/30 bg-destructive/5 p-2">
						<p class="mb-1.5 text-xs">{m.saved_view_confirm_delete()}</p>
						<div class="flex gap-1">
							<Button
								variant="destructive"
								size="sm"
								class="h-6 px-2 text-xs"
								onclick={() => deleteFilter(filter.id)}
							>
								{m.common_delete()}
							</Button>
							<Button
								variant="ghost"
								size="sm"
								class="h-6 px-2 text-xs"
								onclick={() => {
									confirmDeleteId = null;
								}}
							>
								{m.common_cancel()}
							</Button>
						</div>
					</div>
				{:else}
					<div class="group flex items-center gap-1 rounded px-2 py-1.5 hover:bg-muted">
						<button
							type="button"
							class="min-w-0 flex-1 cursor-pointer truncate text-left text-xs"
							onclick={() => applyFilter(filter)}
						>
							{filter.name}
						</button>
						<div
							class="flex shrink-0 items-center gap-0.5 sm:opacity-0 sm:transition-opacity sm:group-focus-within:opacity-100 sm:group-hover:opacity-100"
						>
							{#if hasActiveFilters}
								<button
									type="button"
									class="cursor-pointer rounded p-1 text-muted-foreground hover:bg-muted-foreground/10 hover:text-foreground"
									title={m.saved_view_overwrite()}
									aria-label={m.saved_view_overwrite()}
									onclick={(e) => {
										e.stopPropagation();
										updateFilters(filter);
									}}
								>
									<RefreshCw class="size-3" />
								</button>
							{/if}
							<button
								type="button"
								class="cursor-pointer rounded p-1 text-muted-foreground hover:bg-muted-foreground/10 hover:text-foreground"
								title={m.saved_view_rename()}
								aria-label={m.saved_view_rename()}
								onclick={(e) => {
									e.stopPropagation();
									renamingId = filter.id;
									renamingValue = filter.name;
								}}
							>
								<Pencil class="size-3" />
							</button>
							<button
								type="button"
								class="cursor-pointer rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
								title={m.common_delete()}
								aria-label={m.common_delete()}
								onclick={(e) => {
									e.stopPropagation();
									confirmDeleteId = filter.id;
								}}
							>
								<Trash2 class="size-3" />
							</button>
						</div>
					</div>
				{/if}
			{/each}
		</div>

		{#if hasActiveFilters}
			{#if showSaveInput}
				<div class="mt-2 flex items-center gap-1 border-t pt-2">
					<Input
						class="h-8 text-xs flex-1"
						placeholder={m.saved_view_name_placeholder()}
						bind:value={newViewName}
						onkeydown={(e) => {
							if (e.key === 'Enter') saveCurrentFilters();
							if (e.key === 'Escape') {
								showSaveInput = false;
							}
						}}
					/>
					<Button
						size="sm"
						class="h-8 px-2 text-xs"
						disabled={!newViewName.trim() || saving}
						onclick={saveCurrentFilters}
					>
						{m.saved_view_save()}
					</Button>
				</div>
			{:else}
				<div class="mt-2 border-t pt-2">
					<Button
						variant="ghost"
						size="sm"
						class="h-8 w-full px-2 text-xs"
						onclick={() => {
							showSaveInput = true;
						}}
					>
						{m.saved_view_save_current()}
					</Button>
				</div>
			{/if}
		{/if}
	</Popover.Content>
</Popover.Root>
