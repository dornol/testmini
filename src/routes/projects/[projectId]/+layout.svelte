<script lang="ts">
	import { page } from '$app/state';
	import { cn } from '$lib/utils';

	let { data, children } = $props();

	const tabs = $derived([
		{ href: `/projects/${data.project.id}`, label: 'Dashboard', exact: true },
		{ href: `/projects/${data.project.id}/test-cases`, label: 'Test Cases' },
		{ href: `/projects/${data.project.id}/test-runs`, label: 'Test Runs' },
		...(data.userRole === 'PROJECT_ADMIN' || data.userRole === 'ADMIN'
			? [{ href: `/projects/${data.project.id}/settings`, label: 'Settings' }]
			: [])
	]);

	function isActive(href: string, exact?: boolean): boolean {
		if (exact) return page.url.pathname === href;
		return page.url.pathname.startsWith(href);
	}
</script>

<div class="space-y-6">
	<div>
		<div class="mb-1">
			<a href="/projects" class="text-muted-foreground hover:text-foreground text-sm">&larr; All Projects</a>
		</div>
		<h1 class="text-2xl font-bold">{data.project.name}</h1>
	</div>

	<nav class="border-b">
		<div class="flex gap-4">
			{#each tabs as tab (tab.href)}
				<a
					href={tab.href}
					class={cn(
						'-mb-px border-b-2 px-1 py-2 text-sm font-medium transition-colors',
						isActive(tab.href, tab.exact)
							? 'border-primary text-foreground'
							: 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'
					)}
				>
					{tab.label}
				</a>
			{/each}
		</div>
	</nav>

	{@render children()}
</div>
