<script lang="ts">
	import { goto } from '$app/navigation';
	import { fly } from 'svelte/transition';
	import { Button } from '$lib/components/ui/button/index.js';
	import { apiFetch, apiPost } from '$lib/api-client';

	interface Notification {
		id: number;
		userId: string;
		type: string;
		title: string;
		message: string;
		link: string | null;
		projectId: number | null;
		isRead: boolean;
		createdAt: string;
	}

	let { initialUnreadCount = 0 }: { initialUnreadCount?: number } = $props();

	let open = $state(false);
	let notifications = $state<Notification[]>([]);
	let loading = $state(false);
	let nextCursor = $state<string | null>(null);
	let hasMore = $state(false);
	// Writable derived: tracks prop initially, can be overridden locally (mark-as-read, polling)
	let unreadCount = $derived(initialUnreadCount);

	const unreadInList = $derived(notifications.filter((n) => !n.isRead).length);

	function formatRelativeTime(dateStr: string): string {
		const date = new Date(dateStr);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffSec = Math.floor(diffMs / 1000);
		const diffMin = Math.floor(diffSec / 60);
		const diffHour = Math.floor(diffMin / 60);
		const diffDay = Math.floor(diffHour / 24);

		if (diffSec < 60) return 'just now';
		if (diffMin < 60) return `${diffMin}m ago`;
		if (diffHour < 24) return `${diffHour}h ago`;
		if (diffDay < 7) return `${diffDay}d ago`;
		return date.toLocaleDateString();
	}

	function typeIcon(type: string): string {
		switch (type) {
			case 'TEST_RUN_COMPLETED':
				return '✅';
			case 'TEST_FAILED':
				return '❌';
			case 'MEMBER_ADDED':
				return '👤';
			case 'COMMENT_ADDED':
				return '💬';
			default:
				return '🔔';
		}
	}

	async function loadNotifications(reset = false) {
		if (loading) return;
		loading = true;
		try {
			const params = new URLSearchParams({ limit: '20' });
			if (!reset && nextCursor) {
				params.set('cursor', nextCursor);
			}
			const data = await apiFetch<{ items: Notification[]; nextCursor: string | null; hasMore: boolean }>(
				`/api/notifications?${params}`,
				{ silent: true }
			);
			if (reset) {
				notifications = data.items;
			} else {
				notifications = [...notifications, ...data.items];
			}
			nextCursor = data.nextCursor;
			hasMore = data.hasMore;
			unreadCount = data.items.filter((n) => !n.isRead).length;
		} catch (e) {
			console.warn('Failed to load notifications:', e);
		} finally {
			loading = false;
		}
	}

	async function refreshUnreadCount() {
		try {
			const data = await apiFetch<{ items: Notification[] }>(
				'/api/notifications?limit=50',
				{ silent: true }
			);
			unreadCount = data.items.filter((n) => !n.isRead).length;
		} catch (e) {
			console.warn('Failed to refresh unread count:', e);
		}
	}

	async function markAsRead(ids: number[]) {
		if (ids.length === 0) return;
		try {
			await apiPost('/api/notifications/read', { ids });
			notifications = notifications.map((n) => (ids.includes(n.id) ? { ...n, isRead: true } : n));
			unreadCount = Math.max(0, unreadCount - ids.length);
		} catch (e) {
			console.warn('Failed to mark notifications as read:', e);
		}
	}

	async function markAllAsRead() {
		try {
			await apiPost('/api/notifications/read', { all: true });
			notifications = notifications.map((n) => ({ ...n, isRead: true }));
			unreadCount = 0;
		} catch (e) {
			console.warn('Failed to mark all notifications as read:', e);
		}
	}

	async function handleNotificationClick(n: Notification) {
		if (!n.isRead) {
			await markAsRead([n.id]);
		}
		open = false;
		if (n.link) {
			goto(n.link);
		}
	}

	function toggleOpen() {
		open = !open;
		if (open && notifications.length === 0) {
			loadNotifications(true);
		}
	}

	function handleOutsideClick(event: MouseEvent) {
		const target = event.target as HTMLElement;
		if (!target.closest('[data-notification-bell]')) {
			open = false;
		}
	}

	// Poll with visibility-based backoff: 30s active, 5m when tab hidden
	$effect(() => {
		let intervalId: ReturnType<typeof setInterval>;
		const ACTIVE_INTERVAL = 30_000;
		const HIDDEN_INTERVAL = 300_000;

		function startPolling() {
			clearInterval(intervalId);
			const interval = document.hidden ? HIDDEN_INTERVAL : ACTIVE_INTERVAL;
			intervalId = setInterval(() => {
				if (open) {
					loadNotifications(true);
				} else {
					refreshUnreadCount();
				}
			}, interval);
		}

		function handleVisibilityChange() {
			startPolling();
			// Refresh immediately when tab becomes visible
			if (!document.hidden) {
				refreshUnreadCount();
			}
		}

		startPolling();
		document.addEventListener('visibilitychange', handleVisibilityChange);

		return () => {
			clearInterval(intervalId);
			document.removeEventListener('visibilitychange', handleVisibilityChange);
		};
	});

	// Outside-click to close — only registered while panel is open
	$effect(() => {
		if (!open) return;
		document.addEventListener('click', handleOutsideClick);
		return () => document.removeEventListener('click', handleOutsideClick);
	});

	// Escape key to close panel
	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && open) {
			event.preventDefault();
			open = false;
		}
	}
</script>

<div class="relative" data-notification-bell>
	<!-- Bell button -->
	<Button
		variant="ghost"
		size="icon"
		onclick={toggleOpen}
		aria-label="Notifications"
		aria-haspopup="true"
		aria-expanded={open}
		class="relative"
	>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="18"
			height="18"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
			<path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
		</svg>

		<!-- Unread badge -->
		{#if unreadCount > 0}
			<span
				class="bg-destructive text-destructive-foreground absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-0.5 text-[10px] font-bold leading-none"
				aria-label="{unreadCount} unread notifications"
			>
				{unreadCount > 99 ? '99+' : unreadCount}
			</span>
		{/if}
	</Button>

	<!-- Dropdown panel -->
	{#if open}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			transition:fly={{ y: -8, duration: 150 }}
			class="border-border bg-popover text-popover-foreground absolute right-0 z-50 mt-1 w-80 rounded-md border shadow-lg sm:w-96"
			role="dialog"
			aria-label="Notifications panel"
			onkeydown={handleKeydown}
		>
			<!-- Header -->
			<div class="flex items-center justify-between border-b border-border px-4 py-3">
				<h2 class="text-sm font-semibold">Notifications</h2>
				{#if unreadInList > 0}
					<Button
						variant="ghost"
						size="sm"
						class="h-auto px-2 py-0.5 text-xs"
						onclick={markAllAsRead}
					>
						Mark all as read
					</Button>
				{/if}
			</div>

			<!-- Notification list -->
			<div class="max-h-[400px] overflow-y-auto">
				{#if loading && notifications.length === 0}
					<div class="flex items-center justify-center py-8 text-sm text-muted-foreground">
						Loading…
					</div>
				{:else if notifications.length === 0}
					<div
						class="flex flex-col items-center justify-center gap-2 py-8 text-sm text-muted-foreground"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="24"
							height="24"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="1.5"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"
						>
							<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
							<path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
						</svg>
						<span>No notifications yet</span>
					</div>
				{:else}
					{#each notifications as n (n.id)}
						<button
							type="button"
							class="hover:bg-accent flex w-full cursor-pointer items-start gap-3 px-4 py-3 text-left transition-colors {n.isRead
								? 'opacity-60'
								: ''}"
							onclick={() => handleNotificationClick(n)}
							aria-label="{n.title}{n.isRead ? '' : ' (unread)'}"
						>
							<span class="mt-0.5 shrink-0 text-base" aria-hidden="true">{typeIcon(n.type)}</span>

							<div class="min-w-0 flex-1">
								<div class="flex items-start justify-between gap-2">
									<p class="truncate text-sm font-medium">{n.title}</p>
									{#if !n.isRead}
										<span
											class="bg-primary mt-1 h-2 w-2 shrink-0 rounded-full"
											aria-hidden="true"
										></span>
									{/if}
								</div>
								<p class="line-clamp-2 text-xs text-muted-foreground">{n.message}</p>
								<p class="mt-1 text-[11px] text-muted-foreground/70">
									{formatRelativeTime(n.createdAt)}
								</p>
							</div>
						</button>
					{/each}

					{#if hasMore}
						<div class="border-t border-border px-4 py-2">
							<Button
								variant="ghost"
								size="sm"
								class="w-full text-xs"
								onclick={() => loadNotifications(false)}
								disabled={loading}
							>
								{loading ? 'Loading…' : 'Load more'}
							</Button>
						</div>
					{/if}
				{/if}
			</div>
		</div>
	{/if}
</div>
