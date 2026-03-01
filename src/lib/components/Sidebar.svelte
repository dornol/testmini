<script lang="ts">
	import { page } from '$app/state';
	import { cn } from '$lib/utils';

	let { open = $bindable(true) }: { open: boolean } = $props();

	const navItems = [
		{ href: '/projects', label: 'Projects', icon: 'folder' }
	] as const;

	function isActive(href: string): boolean {
		return page.url.pathname.startsWith(href);
	}
</script>

{#if open}
	<!-- Overlay for mobile -->
	<button
		class="fixed inset-0 z-30 bg-black/50 lg:hidden"
		onclick={() => (open = false)}
		aria-label="Close sidebar"
	></button>
{/if}

<aside
	class={cn(
		'fixed left-0 top-14 z-40 flex h-[calc(100dvh-3.5rem)] w-60 flex-col border-r border-sidebar-border bg-sidebar transition-transform duration-200 lg:static lg:z-auto lg:translate-x-0',
		open ? 'translate-x-0' : '-translate-x-full'
	)}
>
	<nav class="flex-1 space-y-1 p-3">
		{#each navItems as item}
			<a
				href={item.href}
				class={cn(
					'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
					isActive(item.href)
						? 'bg-sidebar-accent text-sidebar-accent-foreground'
						: 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
				)}
			>
				{#if item.icon === 'folder'}
					<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
					</svg>
				{/if}
				{item.label}
			</a>
		{/each}
	</nav>
</aside>
