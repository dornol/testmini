<script lang="ts">
	import { page } from '$app/state';
	import { cn } from '$lib/utils';
	import * as m from '$lib/paraglide/messages.js';

	let { data, children } = $props();

	const teamId = $derived(data.team.id);

	const subNav = $derived([
		{ href: `/teams/${teamId}/settings`, label: m.team_general(), exact: true },
		{ href: `/teams/${teamId}/settings/members`, label: m.nav_members() }
	]);

	function isActive(href: string, exact?: boolean): boolean {
		if (exact) return page.url.pathname === href;
		return page.url.pathname.startsWith(href);
	}
</script>

<div class="space-y-4">
	<div>
		<a href="/teams/{teamId}" class="text-muted-foreground hover:text-foreground text-sm">&larr; {m.common_back_to({ target: data.team.name })}</a>
	</div>

	<h1 class="text-xl font-bold">{m.team_settings()}</h1>

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
</div>
