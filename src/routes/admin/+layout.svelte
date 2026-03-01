<script lang="ts">
	import { page } from '$app/state';
	import { cn } from '$lib/utils';

	let { children } = $props();

	const tabs = [
		{ href: '/admin/users', label: 'Users' },
		{ href: '/admin/projects', label: 'Projects' }
	] as const;
</script>

<div class="space-y-6">
	<div>
		<h1 class="text-2xl font-bold">Admin</h1>
		<p class="text-muted-foreground text-sm">System administration</p>
	</div>

	<div class="border-b">
		<nav class="flex gap-4">
			{#each tabs as tab (tab.href)}
				<a
					href={tab.href}
					class={cn(
						'-mb-px border-b-2 px-1 pb-3 text-sm font-medium transition-colors',
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
