<script lang="ts">
	import { page } from '$app/state';
	import { navigating } from '$app/stores';
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { ModeWatcher, setMode } from 'mode-watcher';
	import { Toaster } from '$lib/components/ui/sonner/index.js';
	import Header from '$lib/components/Header.svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import KeyboardShortcuts from '$lib/components/KeyboardShortcuts.svelte';
	import { setLocale } from '$lib/paraglide/runtime';
	import { onMount } from 'svelte';

	let { children, data } = $props();

	let sidebarOpen = $state(false);
	let prefsApplied = false;
	let showProgress = $state(false);
	let progressTimer: ReturnType<typeof setTimeout> | undefined;

	$effect(() => {
		if ($navigating) {
			progressTimer = setTimeout(() => { showProgress = true; }, 300);
		} else {
			clearTimeout(progressTimer);
			showProgress = false;
		}
		return () => clearTimeout(progressTimer);
	});

	const isAuthPage = $derived(page.url.pathname.startsWith('/auth') || page.url.pathname.startsWith('/shared'));

	// Global data-tip tooltip
	onMount(() => {
		const tip = document.createElement('div');
		tip.id = 'tip-el';
		document.body.appendChild(tip);

		function show(e: MouseEvent) {
			const target = (e.target as HTMLElement).closest<HTMLElement>('[data-tip]');
			if (!target || !target.dataset.tip) { tip.style.opacity = '0'; return; }
			tip.textContent = target.dataset.tip;
			// Make visible off-screen first to measure
			tip.style.left = '-9999px';
			tip.style.top = '-9999px';
			tip.style.opacity = '1';
			const rect = target.getBoundingClientRect();
			const tipRect = tip.getBoundingClientRect();
			let left = rect.left + rect.width / 2 - tipRect.width / 2;
			left = Math.max(4, Math.min(left, window.innerWidth - tipRect.width - 4));
			let top = rect.top - tipRect.height - 4;
			if (top < 4) top = rect.bottom + 4;
			tip.style.left = left + 'px';
			tip.style.top = top + 'px';
		}

		function hide() { tip.style.opacity = '0'; }

		document.addEventListener('mouseover', show);
		document.addEventListener('mouseout', hide);
		document.addEventListener('scroll', hide, true);

		return () => {
			document.removeEventListener('mouseover', show);
			document.removeEventListener('mouseout', hide);
			document.removeEventListener('scroll', hide, true);
			tip.remove();
		};
	});

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

<svelte:head><link rel="icon" href={data.branding?.faviconUrl || favicon} /></svelte:head>

<ModeWatcher />
<Toaster />
<KeyboardShortcuts />

{#if showProgress}
	<div class="bg-muted-foreground/20 fixed top-0 right-0 left-0 z-50 h-0.5 overflow-hidden">
		<div class="bg-muted-foreground/30 h-full w-1/3 animate-[shimmer_1.5s_ease-in-out_infinite]"></div>
	</div>
{/if}

{#if isAuthPage}
	{@render children()}
{:else}
	<div class="flex h-dvh flex-col">
		<Header
			user={data.user}
			onToggleSidebar={() => (sidebarOpen = !sidebarOpen)}
			unreadNotificationCount={data.unreadNotificationCount}
			branding={data.branding}
		/>
		<div class="flex flex-1 overflow-hidden">
			<Sidebar bind:open={sidebarOpen} />
			<main class="flex-1 overflow-y-auto px-2 pb-4 sm:px-4">
				<div class="pt-3 sm:pt-4">
					{@render children()}
				</div>
			</main>
		</div>
	</div>
{/if}
