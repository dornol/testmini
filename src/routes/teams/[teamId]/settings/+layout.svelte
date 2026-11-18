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
		<a
			href="/teams/{teamId}"
			class="inline-block rounded-sm text-sm text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring hover:text-foreground [overflow-wrap:anywhere]"
			>&larr; {m.common_back_to({ target: data.team.name })}</a
		>
	</div>

	<h1 class="text-xl font-bold">{m.team_settings()}</h1>

	<div class="flex flex-col gap-4 md:flex-row md:gap-6">
		<nav class="min-w-0 shrink-0 md:w-44" aria-label={m.team_settings()}>
			<ul class="flex flex-wrap gap-1 md:flex-col">
				{#each subNav as item (item.href)}
					<li class="shrink-0 md:shrink">
						<a
							href={item.href}
							aria-current={isActive(item.href, item.exact) ? 'page' : undefined}
							class={cn(
								'block rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring [overflow-wrap:anywhere]',
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
			{#key teamId}{@render children()}{/key}
		</div>
	</div>
</div>
