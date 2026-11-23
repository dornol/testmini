<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import * as Select from '$lib/components/ui/select';
	import * as Popover from '$lib/components/ui/popover';
	import { Info } from '@lucide/svelte';
	import PriorityBadge from '$lib/components/PriorityBadge.svelte';
	import VirtualList from '$lib/components/VirtualList.svelte';
	import * as m from '$lib/paraglide/messages.js';

	interface PickerCase {
		id: number;
		key: string;
		title: string;
		priority: string;
		tags?: { id: number; name: string; color: string }[];
	}
	const generatedId = $props.id();
	let {
		cases,
		selected = $bindable(new Set<number>()),
		priorities = [],
		tags = [],
		id = generatedId,
		disabled = false,
		error = '',
		maxSelection = 500
	}: {
		cases: PickerCase[];
		selected?: Set<number>;
		priorities?: { name: string; color: string }[];
		tags?: { id: number; name: string; color: string }[];
		id?: string;
		disabled?: boolean;
		error?: string;
		maxSelection?: number;
	} = $props();
	let query = $state('');
	let priority = $state('');
	let tag = $state('');
	const search = $derived(query.trim().toLocaleLowerCase());
	const filtered = $derived(
		cases.filter((item) => {
			return (
				(!search || `${item.key} ${item.title}`.toLocaleLowerCase().includes(search)) &&
				(!priority || item.priority === priority) &&
				(!tag || item.tags?.some((value) => value.id === Number(tag)))
			);
		})
	);
	const visibleSelected = $derived(filtered.filter((item) => selected.has(item.id)).length);
	const allSelected = $derived(filtered.length > 0 && visibleSelected === filtered.length);
	const hasFilters = $derived(!!query.trim() || !!priority || !!tag);
	const feedback = $derived(
		selected.size > maxSelection ? m.ui_case_selection_limit({ count: maxSelection }) : error
	);

	function toggle(id: number) {
		const next = new Set(selected);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		selected = next;
	}
	function toggleAll() {
		const next = new Set(selected);
		for (const item of filtered) {
			if (allSelected) next.delete(item.id);
			else next.add(item.id);
		}
		selected = next;
	}
	function clearFilters() {
		query = '';
		priority = '';
		tag = '';
	}
</script>

<fieldset
	{id}
	{disabled}
	tabindex="-1"
	aria-describedby={feedback ? `${id}-error` : undefined}
	class="min-w-0 space-y-3"
	data-slot="test-case-picker"
>
	<legend class="mb-3 text-sm font-semibold">{m.tr_select_cases({ count: selected.size })}</legend>
	<div class="grid min-w-0 gap-2 sm:flex sm:flex-wrap sm:items-end">
		<label class="grid min-w-0 gap-1 text-xs font-medium sm:flex-1" for={`${id}-search`}>
			{m.ui_case_search()}
			<Input
				id={`${id}-search`}
				bind:value={query}
				placeholder={m.tr_filter_placeholder()}
				onkeydown={(event) => {
					if (event.key === 'Enter') event.preventDefault();
				}}
				{disabled}
			/>
		</label>
		{#if priorities.length > 0}
			<div class="grid min-w-0 gap-1 text-xs font-medium sm:w-36">
				<label for={`${id}-priority`}>{m.common_priority()}</label>
				<Select.Root type="single" bind:value={priority} {disabled}>
					<Select.Trigger id={`${id}-priority`} class="w-full"
						>{priority || m.common_all()}</Select.Trigger
					>
					<Select.Content
						><Select.Item
							value=""
							label={m.common_all()}
						/>{#each priorities as item (item.name)}<Select.Item
								value={item.name}
								label={item.name}
							/>{/each}</Select.Content
					>
				</Select.Root>
			</div>
		{/if}
		{#if tags.length > 0}
			<div class="grid min-w-0 gap-1 text-xs font-medium sm:w-36">
				<label for={`${id}-tag`}>{m.tag_title()}</label>
				<Select.Root type="single" bind:value={tag} {disabled}>
					<Select.Trigger id={`${id}-tag`} class="w-full"
						><span class="truncate"
							>{tags.find((item) => String(item.id) === tag)?.name || m.common_all()}</span
						></Select.Trigger
					>
					<Select.Content
						><Select.Item
							value=""
							label={m.common_all()}
						/>{#each tags as item (item.id)}<Select.Item
								value={String(item.id)}
								label={item.name}
							/>{/each}</Select.Content
					>
				</Select.Root>
			</div>
		{/if}
	</div>
	<div class="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
		<p>{m.ui_case_results({ count: filtered.length, total: cases.length })}</p>
		<p role="status" aria-atomic="true">{m.tr_select_cases({ count: selected.size })}</p>
		{#if hasFilters}<Button type="button" variant="ghost" size="sm" onclick={clearFilters}
				>{m.ui_clear_filters()}</Button
			>{/if}
	</div>
	{#if cases.length === 0}
		<p class="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
			{m.tr_no_cases()}
		</p>
	{:else if filtered.length === 0}
		<div class="rounded-lg border border-dashed p-6 text-center">
			<p class="font-medium">{m.ui_no_filtered_results()}</p>
			<p class="mt-1 text-sm text-muted-foreground">{m.ui_case_no_results_description()}</p>
			<Button type="button" class="mt-3" variant="outline" size="sm" onclick={clearFilters}
				>{m.ui_clear_filters()}</Button
			>
		</div>
	{:else}
		<div class="overflow-hidden rounded-lg border bg-card">
			<label
				class="flex min-h-11 cursor-pointer items-center gap-3 border-b bg-muted/30 px-3 py-2 text-sm font-medium"
			>
				<input
					type="checkbox"
					class="size-4 shrink-0 rounded border-muted-foreground"
					checked={allSelected}
					indeterminate={visibleSelected > 0 && !allSelected}
					onchange={toggleAll}
					{disabled}
				/>
				{m.ui_select_filtered_cases({ count: filtered.length })}
			</label>
			<VirtualList items={filtered} rowHeight={72} height="360px" label={m.ui_case_list()}>
				{#snippet children({ item })}
					{@const entry = item as PickerCase}
					<div
						class="flex h-[72px] min-w-0 items-center gap-1 border-b px-3 hover:bg-muted/40 focus-within:bg-accent"
					>
						<label class="flex min-w-0 flex-1 cursor-pointer items-center gap-3 self-stretch">
							<input
								type="checkbox"
								class="size-4 shrink-0 rounded border-muted-foreground"
								aria-label={m.aria_select_item({ item: `${entry.key} ${entry.title}` })}
								checked={selected.has(entry.id)}
								onchange={() => toggle(entry.id)}
								{disabled}
							/>
							<span class="min-w-0 flex-1">
								<span class="flex min-w-0 items-center gap-2"
									><span class="shrink-0 font-mono text-xs text-muted-foreground">{entry.key}</span
									><PriorityBadge
										name={entry.priority}
										color={priorities.find((value) => value.name === entry.priority)?.color ??
											'#64748b'}
									/></span
								>
								<span
									class="mt-1 line-clamp-2 text-sm font-medium leading-snug [overflow-wrap:anywhere]"
									title={entry.title}>{entry.title}</span
								>
							</span>
						</label>
						<Popover.Root>
							<Popover.Trigger
								type="button"
								{disabled}
								aria-label={m.ui_case_title_details({ key: entry.key })}
								class="flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
							>
								<Info class="size-4" aria-hidden="true" />
							</Popover.Trigger>
							<Popover.Content
								role="dialog"
								collisionPadding={16}
								aria-label={m.ui_case_title_details({ key: entry.key })}
								class="max-w-[calc(100vw-2rem)] [overflow-wrap:anywhere]"
							>
								<p class="mb-2 font-mono text-xs text-muted-foreground">{entry.key}</p>
								<p class="text-sm">{entry.title}</p>
							</Popover.Content>
						</Popover.Root>
					</div>
				{/snippet}
			</VirtualList>
		</div>
	{/if}
	{#if feedback}<p id={`${id}-error`} class="text-sm text-destructive">{feedback}</p>{/if}
</fieldset>
