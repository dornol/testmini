<script lang="ts">
	import { navigating } from '$app/stores';
	import { page } from '$app/state';
	import * as m from '$lib/paraglide/messages.js';
	import { getLocale } from '$lib/paraglide/runtime';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import type { WorkType } from '$lib/my-work';

	let { data } = $props();
	let hydrated = $state(false);
	const loading = $derived($navigating?.to?.url.pathname === '/my-work');
	$effect(() => {
		hydrated = true;
	});

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
	<header>
		<h1 class="text-2xl font-bold tracking-tight">{m.my_work_title()}</h1>
		<p class="text-muted-foreground mt-1 text-sm">{m.my_work_description()}</p>
	</header>

	<section aria-label={m.my_work_type_filter()} class="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
		{#each categories as category (category.type ?? 'ALL')}
			<a
				href={categoryHref(category.type)}
				class="rounded-lg border p-3 text-left transition-colors hover:bg-accent {data.filters.type === category.type ? 'border-primary bg-primary/5' : 'bg-card'}"
				aria-current={data.filters.type === category.type ? 'page' : undefined}
			>
				<span class="block text-lg font-bold">{data.counts[category.type ?? 'ALL'] ?? 0}</span>
				<span class="block truncate text-xs {data.filters.type === category.type ? 'text-foreground' : 'text-muted-foreground'}">{category.label()}</span>
			</a>
		{/each}
	</section>

	<div class="flex flex-col gap-2 sm:flex-row sm:items-end">
		<form method="GET" class="flex flex-col gap-2 sm:flex-row sm:items-end">
			{#if data.filters.type}<input type="hidden" name="type" value={data.filters.type} />{/if}
			<label class="grid gap-1 text-xs font-medium sm:min-w-48">
				{m.my_work_project_filter()}
				<select name="project" class="h-9 rounded-md border bg-background px-3 text-sm" value={data.filters.projectId ?? ''}>
					<option value="">{m.my_work_all_projects()}</option>
					{#each data.projects as project (project.id)}<option value={project.id}>{project.name}</option>{/each}
				</select>
			</label>
			<label class="grid gap-1 text-xs font-medium sm:min-w-40">
				{m.my_work_priority_filter()}
				<select name="priority" class="h-9 rounded-md border bg-background px-3 text-sm" value={data.filters.priority ?? ''}>
					<option value="">{m.my_work_all_priorities()}</option>
					{#each ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as priority}<option value={priority}>{priority}</option>{/each}
				</select>
			</label>
			<Button type="submit" size="sm">{m.my_work_apply_filters()}</Button>
		</form>
		{#if data.filters.type || data.filters.projectId || data.filters.priority}
			<Button variant="ghost" size="sm" href="/my-work">{m.my_work_clear_filters()}</Button>
		{/if}
	</div>

	{#if loading}
		<div class="space-y-3" aria-label={m.my_work_loading()} aria-busy="true">
			{#each Array(5) as _}<Skeleton class="h-24 w-full rounded-lg" />{/each}
		</div>
	{:else if data.items.length === 0}
		<div class="rounded-lg border border-dashed px-6 py-16 text-center">
			<div class="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-muted text-xl" aria-hidden="true">✓</div>
			<h2 class="font-semibold">{m.my_work_empty_title()}</h2>
			<p class="text-muted-foreground mt-1 text-sm">{m.my_work_empty_description()}</p>
		</div>
	{:else}
		<ul class="space-y-3" aria-live="polite">
			{#each data.items as item (item.id)}
				<li>
					<a href={item.href} aria-label={m.my_work_open_item({ title: item.title })} class="group block rounded-lg border bg-card p-4 transition-colors hover:border-primary/50 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
						<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
							<div class="min-w-0">
								<div class="mb-2 flex flex-wrap items-center gap-2">
									<Badge variant={typeVariant(item.type)}>{typeLabel(item.type)}</Badge>
									<span class="text-muted-foreground text-xs">{item.projectName}</span>
									{#if item.priority}<Badge variant="outline">{item.priority}</Badge>{/if}
								</div>
								<h2 class="truncate font-medium group-hover:text-primary">{item.title}</h2>
								{#if item.subtitle}<p class="text-muted-foreground mt-1 line-clamp-2 text-sm">{item.subtitle}</p>{/if}
							</div>
							{#if item.dueAt}<span class="shrink-0 text-xs font-medium text-amber-700 dark:text-amber-400">{m.my_work_due({ date: formatDate(item.dueAt) })}</span>{/if}
						</div>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</div>
