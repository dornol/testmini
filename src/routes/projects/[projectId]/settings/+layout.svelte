<script lang="ts">
	import { page } from '$app/state';
	import { cn } from '$lib/utils';
	import * as m from '$lib/paraglide/messages.js';

	let { data, children } = $props();

	const projectId = $derived(data.project.id);

	const isAdmin = $derived(data.userRole === 'PROJECT_ADMIN' || data.userRole === 'ADMIN');

	const subNav = $derived([
		{ href: `/projects/${projectId}/settings`, label: m.nav_general(), exact: true },
		{ href: `/projects/${projectId}/settings/members`, label: m.nav_members() },
		{ href: `/projects/${projectId}/settings/tags`, label: m.nav_tags() },
		{ href: `/projects/${projectId}/settings/priorities`, label: m.nav_priorities() },
		{ href: `/projects/${projectId}/settings/environments`, label: m.nav_environments() },
		{ href: `/projects/${projectId}/settings/custom-fields`, label: m.nav_custom_fields() },
		...(isAdmin
			? [
					{ href: `/projects/${projectId}/settings/webhooks`, label: m.nav_webhooks() },
					{ href: `/projects/${projectId}/settings/issue-tracker`, label: m.nav_issue_tracker() },
					{ href: `/projects/${projectId}/settings/api-keys`, label: m.nav_api_keys() }
				]
			: [])
	]);

	function isActive(href: string, exact?: boolean): boolean {
		if (exact) return page.url.pathname === href;
		return page.url.pathname.startsWith(href);
	}
</script>

<div class="flex flex-col gap-4 md:flex-row md:gap-6">
	<nav class="shrink-0 md:w-44">
		<ul class="flex gap-1 overflow-x-auto scrollbar-none md:flex-col md:space-y-1 md:overflow-visible">
			{#each subNav as item (item.href)}
				<li class="shrink-0 md:shrink">
					<a
						href={item.href}
						class={cn(
							'block rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors md:py-2 md:text-sm',
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

	<div class="min-w-0 flex-1">
		{@render children()}
	</div>
</div>
