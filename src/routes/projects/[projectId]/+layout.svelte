<script lang="ts">
	import { page } from '$app/state';
	import { cn } from '$lib/utils';
	import * as m from '$lib/paraglide/messages.js';

	let { data, children } = $props();

	const tabs = $derived([
		{ href: `/projects/${data.project.id}`, label: m.nav_dashboard(), exact: true },
		{ href: `/projects/${data.project.id}/test-cases`, label: m.nav_test_cases() },
		{ href: `/projects/${data.project.id}/test-suites`, label: m.nav_test_suites() },
		{ href: `/projects/${data.project.id}/test-runs`, label: m.nav_test_runs() },
		{ href: `/projects/${data.project.id}/reports`, label: m.nav_reports() },
		...(data.userRole === 'PROJECT_ADMIN' || data.userRole === 'ADMIN'
			? [{ href: `/projects/${data.project.id}/settings`, label: m.nav_settings() }]
			: [])
	]);

	function isActive(href: string, exact?: boolean): boolean {
		if (exact) return page.url.pathname === href;
		return page.url.pathname.startsWith(href);
	}
</script>

<div class="space-y-4">
	<div>
		<div class="mb-1">
			<a href="/projects" class="text-muted-foreground hover:text-foreground text-sm">&larr; {m.projects_all()}</a>
		</div>
		<h1 class="text-xl font-bold">{data.project.name}</h1>
	</div>

	<nav class="border-b">
		<div class="flex gap-2" role="tablist">
			{#each tabs as tab (tab.href)}
				<a
					href={tab.href}
					class={cn(
						'-mb-px border-b-2 px-1 py-1.5 text-sm font-medium transition-colors',
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
