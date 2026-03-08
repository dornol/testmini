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
		...(isAdmin
			? [
					{ href: `/projects/${projectId}/settings/webhooks`, label: m.nav_webhooks() },
					{ href: `/projects/${projectId}/settings/api-keys`, label: m.nav_api_keys() }
				]
			: [])
	]);

	function isActive(href: string, exact?: boolean): boolean {
		if (exact) return page.url.pathname === href;
		return page.url.pathname.startsWith(href);
	}
</script>

<div class="flex gap-6">
	<nav class="w-44 shrink-0">
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
