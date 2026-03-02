<script lang="ts">
	import { page } from '$app/state';
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { ModeWatcher } from 'mode-watcher';
	import { Toaster } from '$lib/components/ui/sonner/index.js';
	import Header from '$lib/components/Header.svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';

	let { children, data } = $props();

	let sidebarOpen = $state(false);

	const isAuthPage = $derived(page.url.pathname.startsWith('/auth'));
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<ModeWatcher />
<Toaster />

{#if isAuthPage}
	{@render children()}
{:else}
	<div class="flex h-dvh flex-col">
		<Header user={data.user} onToggleSidebar={() => (sidebarOpen = !sidebarOpen)} />
		<div class="flex flex-1 overflow-hidden">
			<Sidebar bind:open={sidebarOpen} />
			<main class="flex-1 overflow-y-auto p-4">
				{@render children()}
			</main>
		</div>
	</div>
{/if}
