<script lang="ts">
	import { page } from '$app/state';
	import { cn } from '$lib/utils';

	let { data, children } = $props();

	const projectId = $derived(data.project.id);

	const subNav = $derived([
		{ href: `/projects/${projectId}/settings`, label: 'General', exact: true },
		{ href: `/projects/${projectId}/settings/members`, label: 'Members' }
	]);

	function isActive(href: string, exact?: boolean): boolean {
		if (exact) return page.url.pathname === href;
		return page.url.pathname.startsWith(href);
	}
</script>

<div class="flex gap-8">
	<nav class="w-48 shrink-0">
		<ul class="space-y-1">
			{#each subNav as item}
				<li>
					<a
						href={item.href}
						class={cn(
							'block rounded-md px-3 py-2 text-sm font-medium transition-colors',
							isActive(item.href, item.exact)
								? 'bg-accent text-accent-foreground'
								: 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
						)}
					>
						{item.label}
					</a>
				</li>
			{/each}
		</ul>
	</nav>

	<div class="flex-1">
		{@render children()}
	</div>
</div>
