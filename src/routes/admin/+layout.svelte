<script lang="ts">
	import { page } from '$app/state';
	import { cn } from '$lib/utils';
	import * as m from '$lib/paraglide/messages.js';

	let { children } = $props();

	const tabs = [
		{ href: '/admin/users', label: m.nav_users() },
		{ href: '/admin/projects', label: m.nav_projects() },
		{ href: '/admin/oidc-providers', label: m.oidc_providers_title() }
	];
</script>

<div class="space-y-4">
	<div>
		<h1 class="text-xl font-bold">{m.admin_title()}</h1>
		<p class="text-muted-foreground text-sm">{m.admin_desc()}</p>
	</div>

	<div class="border-b">
		<nav class="flex gap-2">
			{#each tabs as tab (tab.href)}
				<a
					href={tab.href}
					class={cn(
						'-mb-px border-b-2 px-1 pb-2 text-sm font-medium transition-colors',
						page.url.pathname.startsWith(tab.href)
							? 'border-primary text-foreground'
							: 'border-transparent text-muted-foreground hover:text-foreground'
					)}
				>
					{tab.label}
				</a>
			{/each}
		</nav>
	</div>

	{@render children()}
</div>
