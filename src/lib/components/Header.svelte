<script lang="ts">
	import { page } from '$app/state';
	import { locales, getLocale, setLocale } from '$lib/paraglide/runtime';
	import * as m from '$lib/paraglide/messages.js';
	import ThemeToggle from './ThemeToggle.svelte';
	import NotificationBell from './NotificationBell.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import { authClient } from '$lib/auth-client';
	import { goto, invalidateAll } from '$app/navigation';

	import logo from '$lib/assets/logo.svg';

	let {
		user,
		onToggleSidebar,
		unreadNotificationCount = 0,
		branding = null
	}: {
		user: any;
		onToggleSidebar: () => void;
		unreadNotificationCount?: number;
		branding?: { appName: string; logoUrl: string | null } | null;
	} = $props();

	async function handleLogout() {
		await authClient.signOut();
		await invalidateAll();
		goto('/auth/login');
	}
</script>

<header class="flex h-11 shrink-0 items-center gap-2 border-b border-border bg-background px-3">
	<Button variant="ghost" size="icon" onclick={onToggleSidebar} aria-label="Toggle sidebar" class="lg:hidden">
		<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<line x1="4" x2="20" y1="12" y2="12" />
			<line x1="4" x2="20" y1="6" y2="6" />
			<line x1="4" x2="20" y1="18" y2="18" />
		</svg>
	</Button>

	<a href="/" class="flex items-center gap-1.5 font-semibold">
		{#if branding?.logoUrl}
			<img src={branding.logoUrl} alt="" class="h-5 w-5 object-contain" />
		{:else}
			<img src={logo} alt="" class="h-5 w-5" />
		{/if}
		<span class="text-base">{branding?.appName || m.app_name()}</span>
	</a>

	<div class="ml-auto flex items-center gap-1">
		<!-- Notification bell (only for authenticated users) -->
		{#if user}
			<NotificationBell initialUnreadCount={unreadNotificationCount} />
		{/if}

		<!-- Language switcher -->
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<Button variant="ghost" size="icon" {...props} aria-label="Change language">
						<span class="text-sm font-medium uppercase">{getLocale()}</span>
					</Button>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="end">
				{#each locales as loc}
					<DropdownMenu.Item onclick={() => setLocale(loc)}>
						{loc === 'ko' ? '한국어' : 'English'}
					</DropdownMenu.Item>
				{/each}
			</DropdownMenu.Content>
		</DropdownMenu.Root>

		<ThemeToggle />

		<!-- User menu -->
		{#if user}
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						<Button variant="ghost" size="sm" {...props}>
							{user.name}
						</Button>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end">
					<DropdownMenu.Label>{user.email}</DropdownMenu.Label>
					<DropdownMenu.Separator />
					<DropdownMenu.Item onclick={() => goto('/account/profile')}>
						{m.nav_profile()}
					</DropdownMenu.Item>
					<DropdownMenu.Separator />
					<DropdownMenu.Item onclick={handleLogout}>
						{m.common_logout()}
					</DropdownMenu.Item>
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		{:else}
			<Button variant="ghost" size="sm" href="/auth/login">{m.common_login()}</Button>
		{/if}
	</div>
</header>
