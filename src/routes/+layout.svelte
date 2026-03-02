<script lang="ts">
	import { page } from '$app/state';
	import { navigating } from '$app/stores';
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { ModeWatcher, setMode } from 'mode-watcher';
	import { Toaster } from '$lib/components/ui/sonner/index.js';
	import Header from '$lib/components/Header.svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import { setLocale } from '$lib/paraglide/runtime';

	let { children, data } = $props();

	let sidebarOpen = $state(false);
	let prefsApplied = false;

	const isAuthPage = $derived(page.url.pathname.startsWith('/auth'));

	$effect(() => {
		if (data.preferences && !prefsApplied) {
			prefsApplied = true;
			if (data.preferences.locale) {
				setLocale(data.preferences.locale as 'ko' | 'en');
			}
			if (data.preferences.theme) {
				setMode(data.preferences.theme as 'light' | 'dark' | 'system');
			}
		}
	});
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<ModeWatcher />
<Toaster />

{#if $navigating}
	<div class="bg-primary fixed top-0 right-0 left-0 z-50 h-0.5 overflow-hidden">
		<div class="bg-primary-foreground/30 h-full w-1/3 animate-[shimmer_1s_ease-in-out_infinite]"></div>
	</div>
{/if}

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
