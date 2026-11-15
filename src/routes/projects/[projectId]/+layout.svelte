<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { cn } from '$lib/utils';
	import * as m from '$lib/paraglide/messages.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';

	let { data, children } = $props();
	let tabList: HTMLDivElement;

	type NavItem = { href: string; label: string; exact?: boolean };
	type NavGroup = { label: string; items: NavItem[] };

	const primaryTabs = $derived<NavItem[]>([
		{ href: `/projects/${data.project.id}`, label: m.nav_dashboard(), exact: true },
		{ href: `/projects/${data.project.id}/test-cases`, label: m.nav_test_cases() },
		{ href: `/projects/${data.project.id}/test-runs`, label: m.nav_test_runs() }
	]);

	const navGroups = $derived<NavGroup[]>([
		{
			label: m.nav_design(),
			items: [
				{ href: `/projects/${data.project.id}/test-suites`, label: m.nav_test_suites() },
				{ href: `/projects/${data.project.id}/test-plans`, label: m.nav_test_plans() },
				{ href: `/projects/${data.project.id}/traceability`, label: m.nav_traceability() }
			]
		},
		{
			label: m.nav_execute(),
			items: [
				{ href: `/projects/${data.project.id}/test-cycles`, label: m.nav_cycles() },
				{ href: `/projects/${data.project.id}/releases`, label: m.nav_releases() },
				{ href: `/projects/${data.project.id}/exploratory`, label: m.nav_exploratory() }
			]
		},
		{
			label: m.nav_analyze(),
			items: [
				{ href: `/projects/${data.project.id}/reports`, label: m.nav_reports() },
				{ href: `/projects/${data.project.id}/quality`, label: m.nav_quality() }
			]
		}
	]);

	const adminTabs = $derived<NavItem[]>([
		...(data.userRole === 'PROJECT_ADMIN' || data.userRole === 'ADMIN'
			? [{ href: `/projects/${data.project.id}/settings`, label: m.nav_settings() }]
			: [])
	]);

	function isActive(href: string, exact?: boolean): boolean {
		if (exact) return page.url.pathname === href;
		return page.url.pathname.startsWith(href);
	}

	function isGroupActive(group: NavGroup) {
		return group.items.some((item) => isActive(item.href, item.exact));
	}

	$effect(() => {
		page.url.pathname;
		requestAnimationFrame(() => {
			tabList
				?.querySelector<HTMLElement>('[aria-current="page"], [data-active="true"]')
				?.scrollIntoView({ block: 'nearest', inline: 'center' });
		});
	});
</script>

<div class="space-y-4">
	<div>
		<div class="mb-1">
			<a href="/projects" class="text-muted-foreground hover:text-foreground text-sm"
				>&larr; {m.projects_all()}</a
			>
		</div>
		<h1 class="text-lg font-bold sm:text-xl">{data.project.name}</h1>
	</div>

	<nav class="border-b" aria-label={m.nav_projects()}>
		<div
			bind:this={tabList}
			class="-mb-px flex gap-2 overflow-x-auto overscroll-x-contain pb-px pr-4 snap-x"
		>
			{#each primaryTabs as tab (tab.href)}
				<a
					href={tab.href}
					class={cn(
						'shrink-0 snap-start border-b-2 px-1 py-1.5 text-xs font-medium whitespace-nowrap transition-colors sm:text-sm',
						isActive(tab.href, tab.exact)
							? 'border-primary text-foreground'
							: 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'
					)}
					aria-current={isActive(tab.href, tab.exact) ? 'page' : undefined}
				>
					{tab.label}
				</a>
			{/each}

			{#each navGroups as group (group.label)}
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<button
								{...props}
								type="button"
								class={cn(
									'shrink-0 snap-start border-b-2 px-1 py-1.5 text-xs font-medium whitespace-nowrap transition-colors sm:text-sm inline-flex items-center gap-1',
									isGroupActive(group)
										? 'border-primary text-foreground'
										: 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'
								)}
								data-active={isGroupActive(group) || undefined}
							>
								{group.label}
								<svg
									class="size-3"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg
								>
							</button>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="start" class="min-w-40">
						{#each group.items as item (item.href)}
							<DropdownMenu.Item
								onclick={() => goto(item.href)}
								class={isActive(item.href, item.exact) ? 'bg-accent font-medium' : ''}
							>
								{item.label}
							</DropdownMenu.Item>
						{/each}
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			{/each}

			{#each adminTabs as tab (tab.href)}
				<a
					href={tab.href}
					class={cn(
						'shrink-0 snap-start border-b-2 px-1 py-1.5 text-xs font-medium whitespace-nowrap transition-colors sm:text-sm',
						isActive(tab.href, tab.exact)
							? 'border-primary text-foreground'
							: 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'
					)}
					aria-current={isActive(tab.href, tab.exact) ? 'page' : undefined}
				>
					{tab.label}
				</a>
			{/each}
		</div>
	</nav>

	{@render children()}
</div>
