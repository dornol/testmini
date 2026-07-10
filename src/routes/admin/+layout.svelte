<script lang="ts">
	import { page } from '$app/state';
	import { cn } from '$lib/utils';
	import * as m from '$lib/paraglide/messages.js';

	let { children } = $props();

	const tabs = [
		{ href: '/admin/users', label: m.nav_users() },
		{ href: '/admin/projects', label: m.nav_projects() },
		{ href: '/admin/branding', label: m.admin_branding_title() },
		{ href: '/admin/oidc-providers', label: m.oidc_providers_title() },
		{ href: '/admin/audit-logs', label: m.nav_audit_logs() }
	];
</script>

<div class="space-y-4">
	<div>
		<h1 class="text-xl font-bold">{m.admin_title()}</h1>
		<p class="text-muted-foreground text-sm">{m.admin_desc()}</p>
	</div>

	<div class="border-b">
		<nav class="-mb-px flex gap-2 overflow-x-auto overscroll-x-contain pb-px pr-4 snap-x">
			{#each tabs as tab (tab.href)}
				<a
					href={tab.href}
					class={cn(
						'shrink-0 snap-start border-b-2 px-1 py-1.5 text-xs font-medium whitespace-nowrap transition-colors sm:text-sm',
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
