<script lang="ts">
	import { navigating, page } from '$app/state';
	import { tick, untrack } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import PageHeader from '$lib/components/patterns/PageHeader.svelte';
	import FilterToolbar from '$lib/components/patterns/FilterToolbar.svelte';
	import EmptyState from '$lib/components/patterns/EmptyState.svelte';
	import * as m from '$lib/paraglide/messages.js';
	import { getLocale } from '$lib/paraglide/runtime';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import type { WorkType } from '$lib/my-work';

	let { data } = $props();
	let hydrated = $state(false);
	let projectInput = $state<HTMLSelectElement>();
	let focusAfterClear = false;
	afterNavigate(() => {
		if (focusAfterClear) {
			focusAfterClear = false;
			void tick().then(() => projectInput?.focus());
		}
	});
	const loading = $derived(navigating.to?.url.pathname === '/my-work');
	const hasFilters = $derived(
		Boolean(data.filters.type || data.filters.projectId || data.filters.priority)
	);
	const missingProject = $derived(
		data.filters.projectId !== null &&
			!data.projects.some(({ id }) => id === data.filters.projectId)
	);
	const selectClass =
		'h-10 w-full min-w-0 rounded-md border border-input bg-background ps-3 pe-9 text-base text-ellipsis focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none md:text-sm';

	function appliedFilters() {
		return { project: String(data.filters.projectId ?? ''), priority: data.filters.priority ?? '' };
	}
	let draft = $state(untrack(appliedFilters));
	$effect(() => {
		page.url.href;
		draft = appliedFilters();
		hydrated = true;
	});
	const priorities = {
		CRITICAL: m.priority_critical,
		HIGH: m.priority_high,
		MEDIUM: m.priority_medium,
		LOW: m.priority_low
	};
	const priorityLabel = (value: string) =>
		priorities[value.toUpperCase() as keyof typeof priorities]?.() ?? value;

	const categories: { type: WorkType | null; label: () => string }[] = [
		{ type: null, label: m.my_work_all },
		{ type: 'ASSIGNED', label: m.my_work_assigned },
		{ type: 'APPROVAL', label: m.my_work_approval },
		{ type: 'EXECUTION', label: m.my_work_execution },
		{ type: 'MENTION', label: m.my_work_mentions },
		{ type: 'FAILURE', label: m.my_work_failures },
		{ type: 'RETEST', label: m.my_work_retest },
		{ type: 'DUE_SOON', label: m.my_work_due_soon }
	];

	function typeLabel(type: WorkType) {
		return categories.find((category) => category.type === type)?.label() ?? type;
	}

	function typeVariant(type: WorkType): 'default' | 'secondary' | 'outline' | 'destructive' {
		if (type === 'FAILURE') return 'destructive';
		if (type === 'APPROVAL' || type === 'DUE_SOON') return 'default';
		if (type === 'RETEST' || type === 'EXECUTION') return 'secondary';
		return 'outline';
	}

	function categoryHref(type: WorkType | null) {
		const params = new URLSearchParams(page.url.searchParams);
		if (type) params.set('type', type);
		else params.delete('type');
		return `/my-work${params.size ? `?${params}` : ''}`;
	}

	function formatDate(date: Date | string) {
		return new Intl.DateTimeFormat(getLocale(), { month: 'short', day: 'numeric' }).format(
			new Date(date)
		);
	}
</script>

<svelte:head><title>{m.my_work_title()} · {m.app_name()}</title></svelte:head>

<div class="mx-auto max-w-6xl space-y-6" data-hydrated={hydrated}>
	<PageHeader title={m.my_work_title()} description={m.my_work_description()} level={1} />

	<div class="space-y-2">
		<p id="my-work-count-scope" class="text-sm text-muted-foreground">{m.my_work_count_scope()}</p>
		<section
			aria-label={m.my_work_type_filter()}
			aria-describedby="my-work-count-scope"
			class="grid grid-cols-2 gap-2 min-[360px]:grid-cols-4 lg:grid-cols-8"
		>
			{#each categories as category (category.type ?? 'ALL')}
				<a
					href={categoryHref(category.type)}
					data-sveltekit-noscroll
					data-sveltekit-keepfocus
					class="rounded-xl border p-2.5 text-left transition-colors sm:p-3 hover:border-primary/40 hover:bg-accent {data
						.filters.type === category.type
						? 'border-primary bg-primary/5 ring-1 ring-primary'
						: 'bg-card'}"
					aria-current={data.filters.type === category.type ? 'page' : undefined}
				>
					<span class="block text-2xl font-semibold tabular-nums tracking-tight"
						>{data.counts[category.type ?? 'ALL'] ?? 0}</span
					>
					<span
						class="mt-1 block text-xs leading-snug {data.filters.type === category.type
							? 'text-foreground'
							: 'text-muted-foreground'}">{category.label()}</span
					>
				</a>
			{/each}
		</section>
	</div>

	<FilterToolbar label={m.ui_filters()} class="items-end">
		<form
			method="GET"
			action="/my-work"
			data-sveltekit-keepfocus
			data-sveltekit-noscroll
			onsubmit={(event) => {
				if (loading) event.preventDefault();
			}}
			class="grid min-w-0 flex-1 basis-full grid-cols-1 items-end gap-2 sm:basis-0 sm:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_auto]"
		>
			{#if data.filters.type}<input type="hidden" name="type" value={data.filters.type} />{/if}
			<label class="grid min-w-0 gap-1 text-sm font-medium">
				{m.my_work_project_filter()}
				<select
					name="project"
					class={selectClass}
					bind:value={draft.project}
					bind:this={projectInput}
				>
					<option value="">{m.my_work_all_projects()}</option>
					{#if missingProject}
						<option value={String(data.filters.projectId)}>{m.my_work_unavailable_project()}</option
						>
					{/if}
					{#each data.projects as project (project.id)}
						<option value={String(project.id)}>{project.name}</option>
					{/each}
				</select>
			</label>
			<label class="grid min-w-0 gap-1 text-sm font-medium">
				{m.my_work_priority_filter()}
				<select name="priority" class={selectClass} bind:value={draft.priority}>
					<option value="">{m.my_work_all_priorities()}</option>
					{#each Object.keys(priorities) as priority (priority)}
						<option value={priority}>{priorityLabel(priority)}</option>
					{/each}
				</select>
			</label>
			<Button type="submit" aria-disabled={loading}>{m.my_work_apply_filters()}</Button>
		</form>
		{#if hasFilters}
			<Button
				variant="ghost"
				href="/my-work"
				data-sveltekit-noscroll
				onclick={(event) => {
					if (
						!event.metaKey &&
						!event.ctrlKey &&
						!event.shiftKey &&
						!event.altKey &&
						event.button === 0
					)
						focusAfterClear = true;
				}}>{m.my_work_clear_filters()}</Button
			>
		{/if}
	</FilterToolbar>

	<section aria-labelledby="my-work-results" class="space-y-3">
		<div class="flex flex-wrap items-baseline justify-between gap-2">
			<h2 id="my-work-results" class="text-lg font-semibold">{m.my_work_results()}</h2>
			<p role="status" class="text-sm text-muted-foreground">
				{loading ? m.my_work_loading() : m.my_work_result_count({ count: data.items.length })}
			</p>
		</div>
		<div aria-busy={loading} class="space-y-3">
			{#if !data.items.length}
				<EmptyState
					title={hasFilters ? m.ui_no_filtered_results() : m.my_work_empty_title()}
					description={hasFilters ? m.my_work_empty_description() : m.my_work_unfiltered_empty()}
				/>
			{:else}
				<ul class="space-y-3">
					{#each data.items as item (item.id)}
						<li>
							<a
								href={item.href}
								aria-labelledby={`my-work-title-${item.id}`}
								aria-describedby={[
									`my-work-meta-${item.id}`,
									item.subtitle && `my-work-subtitle-${item.id}`,
									item.dueAt && `my-work-due-${item.id}`
								]
									.filter(Boolean)
									.join(' ')}
								class="group block rounded-lg border bg-card p-4 transition-colors hover:border-primary/50 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							>
								<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
									<div class="min-w-0">
										<div
											id={`my-work-meta-${item.id}`}
											class="mb-2 flex flex-wrap items-center gap-2"
										>
											<Badge variant={typeVariant(item.type)}>{typeLabel(item.type)}</Badge>
											<span
												class="min-w-0 max-w-full text-xs text-muted-foreground [overflow-wrap:anywhere]"
												>{item.projectName}</span
											>
											{#if item.priority}<Badge variant="outline"
													>{priorityLabel(item.priority)}</Badge
												>{/if}
										</div>
										<h3
											id={`my-work-title-${item.id}`}
											class="font-medium [overflow-wrap:anywhere] group-hover:text-primary"
										>
											{item.title}
										</h3>
										{#if item.subtitle}<p
												id={`my-work-subtitle-${item.id}`}
												class="text-muted-foreground mt-1 text-sm [overflow-wrap:anywhere]"
											>
												{item.subtitle}
											</p>{/if}
									</div>
									{#if item.dueAt}<time
											id={`my-work-due-${item.id}`}
											datetime={new Date(item.dueAt).toISOString()}
											class="shrink-0 text-xs font-medium text-amber-700 dark:text-amber-400"
											>{m.my_work_due({ date: formatDate(item.dueAt) })}</time
										>{/if}
								</div>
							</a>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</section>
</div>
