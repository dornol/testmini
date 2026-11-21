<script lang="ts">
	import { tick } from 'svelte';
	import type { SubmitFunction } from '@sveltejs/kit';
	import * as m from '$lib/paraglide/messages.js';
	import { enhance } from '$app/forms';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { toast } from 'svelte-sonner';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';

	let { data } = $props();

	type User = (typeof data.users)[number];
	type Kind = 'approve' | 'reject' | 'ban' | 'makeAdmin' | 'removeAdmin';

	// Every state change that needs confirming goes through the same dialog.
	const flows: Record<
		Kind,
		{
			action: string;
			role?: string;
			title: () => string;
			confirm: (name: string) => string;
			submit: () => string;
			success: () => string;
			destructive: boolean;
		}
	> = {
		approve: {
			action: '?/approve',
			title: m.admin_approve_title,
			confirm: (name) => m.admin_approve_confirm({ name }),
			submit: m.admin_approve,
			success: m.admin_user_approved,
			destructive: false
		},
		reject: {
			action: '?/reject',
			title: m.admin_reject_title,
			confirm: (name) => m.admin_reject_confirm({ name }),
			submit: m.admin_reject,
			success: m.admin_user_rejected,
			destructive: true
		},
		ban: {
			action: '?/ban',
			title: m.admin_ban_title,
			confirm: (name) => m.admin_ban_confirm({ name }),
			submit: m.admin_ban,
			success: m.admin_user_banned,
			destructive: true
		},
		makeAdmin: {
			action: '?/updateRole',
			role: 'admin',
			title: m.admin_role_change_title,
			confirm: (name) => m.admin_make_admin_confirm({ name }),
			submit: m.admin_make_admin,
			success: m.admin_updated,
			destructive: false
		},
		removeAdmin: {
			action: '?/updateRole',
			role: 'user',
			title: m.admin_role_change_title,
			confirm: (name) => m.admin_remove_admin_confirm({ name }),
			submit: m.admin_remove_admin,
			success: m.admin_updated,
			destructive: true
		}
	};

	// The row changed or disappeared since the list was loaded.
	const staleErrors = new Set([
		'User not found',
		'User is already approved',
		'Only pending users can be rejected'
	]);

	// Follows the URL, but stays editable while typing.
	let searchInput = $derived(data.search);
	let searchEl = $state<HTMLInputElement | null>(null);

	let change = $state<{ kind: Kind; user: User } | null>(null);
	let open = $state(false);
	let banReason = $state('');
	let pending = $state(false);
	let done = $state(false);
	let error = $state('');
	let errorEl = $state<HTMLElement | null>(null);

	const currentUserId = $derived((page.data as { user?: { id: string } | null }).user?.id);

	function listUrl({
		search = data.search,
		pending: pendingOnly = data.pendingOnly,
		pageNo = 1
	}: { search?: string; pending?: boolean; pageNo?: number } = {}) {
		const params = new URLSearchParams();
		if (search) params.set('search', search);
		if (pendingOnly) params.set('pending', 'true');
		if (pageNo > 1) params.set('page', String(pageNo));
		const query = params.toString();
		return query ? `/admin/users?${query}` : '/admin/users';
	}

	function openChange(kind: Kind, user: User) {
		change = { kind, user };
		banReason = '';
		error = '';
		done = false;
		open = true;
	}

	function failureMessage(serverError: unknown) {
		if (serverError === 'User not found') return m.admin_user_not_found();
		if (staleErrors.has(serverError as string)) return m.admin_user_state_changed();
		if (
			serverError === 'Cannot change your own role' ||
			serverError === 'Cannot ban yourself' ||
			serverError === 'Cannot reject yourself'
		)
			return m.admin_self_action();
		return m.error_operation_failed();
	}

	const submit: SubmitFunction = ({ cancel }) => {
		if (pending) {
			cancel();
			return;
		}
		pending = true;
		error = '';
		return async ({ result }) => {
			try {
				if (result.type === 'success') {
					done = true;
					open = false;
					await invalidateAll();
					toast.success(change ? flows[change.kind].success() : m.admin_updated());
				} else {
					const serverError = result.type === 'failure' ? result.data?.error : undefined;
					error = failureMessage(serverError);
					if (staleErrors.has(serverError as string)) await invalidateAll();
					await tick();
					errorEl?.focus();
				}
			} finally {
				pending = false;
			}
		};
	};

	// Unbanning is reversible, so it skips the dialog and reports the result in a toast.
	const quickSubmit: SubmitFunction = ({ cancel }) => {
		if (pending) {
			cancel();
			return;
		}
		pending = true;
		return async ({ result }) => {
			try {
				if (result.type === 'success') {
					toast.success(m.admin_updated());
					await invalidateAll();
				} else {
					toast.error(failureMessage(result.type === 'failure' ? result.data?.error : undefined));
				}
			} finally {
				pending = false;
			}
		};
	};

	// The acted-on row's buttons often disappear, so land on the search field instead of <body>.
	function restoreFocus(event: Event) {
		if (!done) return;
		event.preventDefault();
		searchEl?.focus();
	}
</script>

{#snippet status(u: User)}
	{#if u.banned}
		<Badge variant="destructive">{m.admin_banned()}</Badge>
		{#if u.banReason}
			<p class="mt-1 text-xs text-muted-foreground [overflow-wrap:anywhere]">{u.banReason}</p>
		{/if}
	{:else if !u.approved}
		<Badge
			class="border-amber-200 bg-amber-100 text-amber-800 dark:border-amber-800 dark:bg-amber-900 dark:text-amber-200"
			>{m.admin_pending()}</Badge
		>
	{:else}
		<Badge variant="outline">{m.common_active()}</Badge>
	{/if}
{/snippet}

{#snippet act(u: User, kind: Kind, label: string, tone: string)}
	<Button
		type="button"
		variant="ghost"
		size="sm"
		class="min-h-10 px-2 text-xs {tone}"
		aria-label={m.admin_user_action_label({ name: u.name, action: label })}
		onclick={() => openChange(kind, u)}>{label}</Button
	>
{/snippet}

{#snippet actions(u: User)}
	{#if u.id === currentUserId}
		<span class="text-xs text-muted-foreground">{m.admin_you()}</span>
	{:else}
		<div class="flex flex-wrap gap-1">
			{#if !u.approved}
				{@render act(u, 'approve', m.admin_approve(), 'text-green-700 dark:text-green-400')}
				{@render act(u, 'reject', m.admin_reject(), 'text-destructive')}
			{:else if u.role === 'admin'}
				{@render act(u, 'removeAdmin', m.admin_remove_admin(), '')}
			{:else}
				{@render act(u, 'makeAdmin', m.admin_make_admin(), '')}
			{/if}
			{#if u.banned}
				<form method="POST" action="?/unban" use:enhance={quickSubmit}>
					<input type="hidden" name="userId" value={u.id} />
					<Button
						type="submit"
						variant="ghost"
						size="sm"
						class="min-h-10 px-2 text-xs text-green-700 dark:text-green-400"
						disabled={pending}
						aria-label={m.admin_user_action_label({ name: u.name, action: m.admin_unban() })}
						>{m.admin_unban()}</Button
					>
				</form>
			{:else}
				{@render act(u, 'ban', m.admin_ban(), 'text-destructive')}
			{/if}
		</div>
	{/if}
{/snippet}

<div class="space-y-4">
	<!-- Search -->
	<form
		onsubmit={(e) => {
			e.preventDefault();
			goto(listUrl({ search: searchInput.trim() }));
		}}
		class="flex flex-col gap-2 sm:flex-row"
	>
		<Input
			type="search"
			name="search"
			maxlength={100}
			placeholder={m.admin_search_placeholder()}
			class="w-full sm:max-w-sm"
			bind:ref={searchEl}
			bind:value={searchInput}
			aria-label={m.admin_search_placeholder()}
		/>
		<div class="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:flex sm:flex-wrap">
			<Button type="submit" variant="outline" class="min-h-10 w-full sm:w-auto"
				>{m.common_search()}</Button
			>
			<Button
				type="button"
				variant={data.pendingOnly ? 'default' : 'outline'}
				aria-pressed={data.pendingOnly}
				class="min-h-10 w-full sm:w-auto"
				onclick={() => goto(listUrl({ pending: !data.pendingOnly }))}
			>
				{m.admin_show_pending()}
			</Button>
		</div>
	</form>

	<!-- Mobile users list -->
	<div class="space-y-3 sm:hidden">
		{#each data.users as u (u.id)}
			<Card.Root class="gap-3 rounded-lg p-4">
				<div class="min-w-0 space-y-1 [overflow-wrap:anywhere]">
					<p class="text-sm leading-snug font-semibold">{u.name}</p>
					<p class="text-xs text-muted-foreground">{u.email}</p>
				</div>
				<div class="flex flex-wrap items-center gap-2">
					<Badge variant={u.role === 'admin' ? 'default' : 'secondary'}>{u.role ?? 'user'}</Badge>
					<div>{@render status(u)}</div>
					<span class="text-xs text-muted-foreground">
						{new Date(u.createdAt).toLocaleDateString()}
					</span>
				</div>
				{@render actions(u)}
			</Card.Root>
		{/each}
		{#if data.users.length === 0}
			<Card.Root class="rounded-lg p-6 text-center">
				<p class="text-sm font-medium text-muted-foreground">{m.admin_no_users()}</p>
				<p class="mt-1 text-xs text-muted-foreground">{m.admin_no_users_hint()}</p>
			</Card.Root>
		{/if}
	</div>

	<!-- Users Table -->
	<Card.Root class="hidden overflow-hidden sm:flex">
		<Table.Root class="table-fixed" aria-label={m.nav_users()}>
			<Table.Header>
				<Table.Row>
					<Table.Head class="w-[28%]">{m.common_name()}</Table.Head>
					<Table.Head class="w-[28%]">{m.common_email()}</Table.Head>
					<Table.Head class="w-24">{m.common_role()}</Table.Head>
					<Table.Head class="w-28">{m.common_status()}</Table.Head>
					<Table.Head class="w-28">{m.common_created()}</Table.Head>
					<Table.Head class="w-48">{m.common_actions()}</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each data.users as u (u.id)}
					<Table.Row>
						<Table.Cell class="font-medium whitespace-normal [overflow-wrap:anywhere]"
							>{u.name}</Table.Cell
						>
						<Table.Cell class="whitespace-normal text-muted-foreground [overflow-wrap:anywhere]"
							>{u.email}</Table.Cell
						>
						<Table.Cell>
							<Badge variant={u.role === 'admin' ? 'default' : 'secondary'}
								>{u.role ?? 'user'}</Badge
							>
						</Table.Cell>
						<Table.Cell class="whitespace-normal">{@render status(u)}</Table.Cell>
						<Table.Cell class="text-xs text-muted-foreground">
							{new Date(u.createdAt).toLocaleDateString()}
						</Table.Cell>
						<Table.Cell>{@render actions(u)}</Table.Cell>
					</Table.Row>
				{/each}
				{#if data.users.length === 0}
					<Table.Row>
						<Table.Cell colspan={6} class="py-12 text-center">
							<p class="font-medium text-muted-foreground">{m.admin_no_users()}</p>
							<p class="text-sm text-muted-foreground">{m.admin_no_users_hint()}</p>
						</Table.Cell>
					</Table.Row>
				{/if}
			</Table.Body>
		</Table.Root>
	</Card.Root>

	<!-- Pagination -->
	{#if data.pagination.total > 0}
		<div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
			<p class="text-sm text-muted-foreground">
				{m.admin_users_total({ count: data.pagination.total })}
			</p>
			{#if data.pagination.totalPages > 1}
				<nav class="flex flex-wrap items-center gap-2" aria-label={m.pagination_label()}>
					{#if data.pagination.page > 1}
						<Button
							variant="outline"
							size="sm"
							class="min-h-10"
							href={listUrl({ pageNo: data.pagination.page - 1 })}
						>
							{m.common_previous()}
						</Button>
					{/if}
					<span class="text-sm text-muted-foreground" aria-current="page">
						{data.pagination.page} / {data.pagination.totalPages}
					</span>
					{#if data.pagination.page < data.pagination.totalPages}
						<Button
							variant="outline"
							size="sm"
							class="min-h-10"
							href={listUrl({ pageNo: data.pagination.page + 1 })}
						>
							{m.common_next()}
						</Button>
					{/if}
				</nav>
			{/if}
		</div>
	{/if}
</div>

<AlertDialog.Root bind:open>
	{#if change}
		{@const flow = flows[change.kind]}
		<AlertDialog.Content
			onCloseAutoFocus={restoreFocus}
			escapeKeydownBehavior={pending ? 'ignore' : 'close'}
		>
			<AlertDialog.Header>
				<AlertDialog.Title>{flow.title()}</AlertDialog.Title>
				<AlertDialog.Description class="[overflow-wrap:anywhere]">
					{flow.confirm(change.user.name)}
				</AlertDialog.Description>
			</AlertDialog.Header>
			{#if change.kind === 'ban'}
				<div class="space-y-2">
					<Label for="ban-reason">{m.admin_ban_reason_placeholder()}</Label>
					<Input id="ban-reason" maxlength={500} bind:value={banReason} disabled={pending} />
				</div>
			{/if}
			{#if error}
				<p role="alert" tabindex="-1" bind:this={errorEl} class="text-sm text-destructive">
					{error}
				</p>
			{/if}
			<AlertDialog.Footer>
				<AlertDialog.Cancel class="min-h-10 w-full sm:w-auto" disabled={pending}
					>{m.common_cancel()}</AlertDialog.Cancel
				>
				<form class="w-full sm:w-auto" method="POST" action={flow.action} use:enhance={submit}>
					<input type="hidden" name="userId" value={change.user.id} />
					{#if flow.role}<input type="hidden" name="role" value={flow.role} />{/if}
					{#if change.kind === 'ban'}<input type="hidden" name="banReason" value={banReason} />{/if}
					<Button
						type="submit"
						variant={flow.destructive ? 'destructive' : 'default'}
						class="min-h-10 w-full sm:w-auto"
						disabled={pending}
					>
						{pending ? m.common_saving() : flow.submit()}
					</Button>
				</form>
			</AlertDialog.Footer>
		</AlertDialog.Content>
	{/if}
</AlertDialog.Root>
