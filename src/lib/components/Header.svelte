<script lang="ts">
	import { page } from '$app/state';
	import { locales, localizeHref, getLocale } from '$lib/paraglide/runtime';
	import * as m from '$lib/paraglide/messages.js';
	import ThemeToggle from './ThemeToggle.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import { authClient } from '$lib/auth-client';
	import { goto, invalidateAll } from '$app/navigation';

	let { user, onToggleSidebar }: { user: any; onToggleSidebar: () => void } = $props();

	async function handleLogout() {
		await authClient.signOut();
		await invalidateAll();
		goto('/auth/login');
	}
</script>

<header class="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background px-4">
	<Button variant="ghost" size="icon" onclick={onToggleSidebar} aria-label="Toggle sidebar" class="lg:hidden">
		<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<line x1="4" x2="20" y1="12" y2="12" />
			<line x1="4" x2="20" y1="6" y2="6" />
			<line x1="4" x2="20" y1="18" y2="18" />
		</svg>
	</Button>

	<a href="/" class="flex items-center gap-2 font-semibold">
		<span class="text-lg">{m.app_name()}</span>
	</a>

	<div class="ml-auto flex items-center gap-1">
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
					<DropdownMenu.Item>
						<a href={localizeHref(page.url.pathname, { locale: loc })} class="w-full">
							{loc === 'ko' ? '한국어' : 'English'}
						</a>
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
