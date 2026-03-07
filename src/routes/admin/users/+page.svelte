<script lang="ts">
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
	import { Badge } from '$lib/components/ui/badge/index.js';

	let { data } = $props();

	let searchInput = $state('');
	$effect(() => {
		searchInput = data.search;
	});

	let banDialogOpen = $state(false);
	let banTarget = $state<{ id: string; name: string } | null>(null);
	let banReason = $state('');

	let approveDialogOpen = $state(false);
	let approveTarget = $state<{ id: string; name: string } | null>(null);
	let rejectDialogOpen = $state(false);
	let rejectTarget = $state<{ id: string; name: string } | null>(null);

	function doSearch() {
		const params = new URLSearchParams();
		if (searchInput) params.set('search', searchInput);
		goto(`/admin/users?${params.toString()}`);
	}

	function openBanDialog(userId: string, userName: string) {
		banTarget = { id: userId, name: userName };
		banReason = '';
		banDialogOpen = true;
	}

	function handleResult() {
		return async ({
			result,
			update
		}: {
			result: { type: string; data?: Record<string, unknown> };
			update: () => Promise<void>;
		}) => {
			if (result.type === 'success') {
				toast.success(m.admin_updated());
				await invalidateAll();
			} else if (result.type === 'failure') {
				toast.error((result.data?.error as string) ?? m.error_operation_failed());
				await update();
			}
		};
	}

	function handleBanResult() {
		return async ({
			result,
			update
		}: {
			result: { type: string; data?: Record<string, unknown> };
			update: () => Promise<void>;
		}) => {
			if (result.type === 'success') {
				banDialogOpen = false;
				toast.success(m.admin_user_banned());
				await invalidateAll();
			} else if (result.type === 'failure') {
				toast.error((result.data?.error as string) ?? m.error_operation_failed());
				await update();
			}
		};
	}

	const currentUserId = $derived((page.data as Record<string, unknown>).user as { id: string } | null);
</script>

<div class="space-y-4">
	<!-- Search -->
	<form onsubmit={(e) => { e.preventDefault(); doSearch(); }} class="flex gap-2">
		<Input placeholder={m.admin_search_placeholder()} class="max-w-sm" bind:value={searchInput} aria-label={m.admin_search_placeholder()} />
		<Button type="submit" variant="outline">{m.common_search()}</Button>
		<Button
			variant={data.pendingOnly ? 'default' : 'outline'}
			href={data.pendingOnly ? '/admin/users' : '/admin/users?pending=true'}
		>
			{m.admin_show_pending()}
		</Button>
	</form>

	<!-- Users Table -->
	<Card.Root>
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head>{m.common_name()}</Table.Head>
					<Table.Head>{m.common_email()}</Table.Head>
					<Table.Head class="w-28">{m.common_role()}</Table.Head>
					<Table.Head class="w-24">{m.common_status()}</Table.Head>
					<Table.Head class="w-32">{m.common_created()}</Table.Head>
					<Table.Head class="w-40">{m.common_actions()}</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each data.users as u (u.id)}
					<Table.Row>
						<Table.Cell class="font-medium">{u.name}</Table.Cell>
						<Table.Cell class="text-muted-foreground">{u.email}</Table.Cell>
						<Table.Cell>
							<Badge variant={u.role === 'admin' ? 'default' : 'secondary'}>
								{u.role ?? 'user'}
							</Badge>
						</Table.Cell>
						<Table.Cell>
							{#if u.banned}
								<Badge variant="destructive">{m.admin_banned()}</Badge>
							{:else if !u.approved}
								<Badge class="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 border-amber-200 dark:border-amber-800">{m.admin_pending()}</Badge>
							{:else}
								<Badge variant="outline">{m.common_active()}</Badge>
							{/if}
						</Table.Cell>
						<Table.Cell class="text-muted-foreground text-xs">
							{new Date(u.createdAt).toLocaleDateString()}
						</Table.Cell>
						<Table.Cell>
							{#if u.id !== currentUserId?.id}
								<div class="flex gap-1">
									{#if !u.approved}
										<Button
											type="button"
											variant="ghost"
											size="sm"
											class="h-7 px-2 text-xs text-green-600"
											onclick={() => { approveTarget = { id: u.id, name: u.name }; approveDialogOpen = true; }}
										>
											{m.admin_approve()}
										</Button>
										<Button
											type="button"
											variant="ghost"
											size="sm"
											class="text-destructive h-7 px-2 text-xs"
											onclick={() => { rejectTarget = { id: u.id, name: u.name }; rejectDialogOpen = true; }}
										>
											{m.admin_reject()}
										</Button>
									{:else if u.role !== 'admin'}
										<form method="POST" action="?/updateRole" use:enhance={handleResult}>
											<input type="hidden" name="userId" value={u.id} />
											<input type="hidden" name="role" value="admin" />
											<Button type="submit" variant="ghost" size="sm" class="h-7 px-2 text-xs">
												{m.admin_make_admin()}
											</Button>
										</form>
									{:else}
										<form method="POST" action="?/updateRole" use:enhance={handleResult}>
											<input type="hidden" name="userId" value={u.id} />
											<input type="hidden" name="role" value="user" />
											<Button type="submit" variant="ghost" size="sm" class="h-7 px-2 text-xs">
												{m.admin_remove_admin()}
											</Button>
										</form>
									{/if}
									{#if u.banned}
										<form method="POST" action="?/unban" use:enhance={handleResult}>
											<input type="hidden" name="userId" value={u.id} />
											<Button type="submit" variant="ghost" size="sm" class="h-7 px-2 text-xs text-green-600">
												{m.admin_unban()}
											</Button>
										</form>
									{:else}
										<Button
											type="button"
											variant="ghost"
											size="sm"
											class="text-destructive h-7 px-2 text-xs"
											onclick={() => openBanDialog(u.id, u.name)}
										>
											{m.admin_ban()}
										</Button>
									{/if}
								</div>
							{:else}
								<span class="text-muted-foreground text-xs">{m.admin_you()}</span>
							{/if}
						</Table.Cell>
					</Table.Row>
				{/each}
				{#if data.users.length === 0}
					<Table.Row>
						<Table.Cell colspan={6} class="py-12 text-center">
							<div class="flex flex-col items-center gap-2">
								<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground">
									<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
									<circle cx="9" cy="7" r="4" />
									<path d="M22 21v-2a4 4 0 0 0-3-3.87" />
									<path d="M16 3.13a4 4 0 0 1 0 7.75" />
								</svg>
								<p class="text-muted-foreground font-medium">{m.admin_no_users()}</p>
								<p class="text-muted-foreground text-sm">{m.admin_no_users_hint()}</p>
							</div>
						</Table.Cell>
					</Table.Row>
				{/if}
			</Table.Body>
		</Table.Root>
	</Card.Root>

	<!-- Pagination -->
	{#if data.pagination.totalPages > 1}
		<div class="flex items-center justify-between">
			<p class="text-muted-foreground text-sm">
				{m.admin_users_total({ count: data.pagination.total })}
			</p>
			<div class="flex gap-2">
				{#if data.pagination.page > 1}
					<Button
						variant="outline"
						size="sm"
						href="/admin/users?page={data.pagination.page - 1}{data.search ? `&search=${data.search}` : ''}"
					>
						{m.common_previous()}
					</Button>
				{/if}
				<span class="text-muted-foreground flex items-center text-sm">
					{data.pagination.page} / {data.pagination.totalPages}
				</span>
				{#if data.pagination.page < data.pagination.totalPages}
					<Button
						variant="outline"
						size="sm"
						href="/admin/users?page={data.pagination.page + 1}{data.search ? `&search=${data.search}` : ''}"
					>
						{m.common_next()}
					</Button>
				{/if}
			</div>
		</div>
	{/if}
</div>

<!-- Approve Dialog -->
<AlertDialog.Root bind:open={approveDialogOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{m.admin_approve_title()}</AlertDialog.Title>
			<AlertDialog.Description>
				{m.admin_approve_confirm({ name: approveTarget?.name ?? '' })}
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>{m.common_cancel()}</AlertDialog.Cancel>
			<form method="POST" action="?/approve" use:enhance={() => {
				return async ({ result, update }) => {
					if (result.type === 'success') {
						approveDialogOpen = false;
						toast.success(m.admin_user_approved());
						await invalidateAll();
					} else if (result.type === 'failure') {
						toast.error((result.data?.error as string) ?? m.error_operation_failed());
						await update();
					}
				};
			}}>
				<input type="hidden" name="userId" value={approveTarget?.id ?? ''} />
				<Button type="submit">{m.admin_approve()}</Button>
			</form>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

<!-- Reject Dialog -->
<AlertDialog.Root bind:open={rejectDialogOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{m.admin_reject_title()}</AlertDialog.Title>
			<AlertDialog.Description>
				{m.admin_reject_confirm({ name: rejectTarget?.name ?? '' })}
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>{m.common_cancel()}</AlertDialog.Cancel>
			<form method="POST" action="?/reject" use:enhance={() => {
				return async ({ result, update }) => {
					if (result.type === 'success') {
						rejectDialogOpen = false;
						toast.success(m.admin_user_rejected());
						await invalidateAll();
					} else if (result.type === 'failure') {
						toast.error((result.data?.error as string) ?? m.error_operation_failed());
						await update();
					}
				};
			}}>
				<input type="hidden" name="userId" value={rejectTarget?.id ?? ''} />
				<Button type="submit" variant="destructive">{m.admin_reject()}</Button>
			</form>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

<!-- Ban Dialog -->
<AlertDialog.Root bind:open={banDialogOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{m.admin_ban_title()}</AlertDialog.Title>
			<AlertDialog.Description>
				{m.admin_ban_confirm({ name: banTarget?.name ?? '' })}
			</AlertDialog.Description>
		</AlertDialog.Header>
		<div class="py-3">
			<Input placeholder={m.admin_ban_reason_placeholder()} bind:value={banReason} aria-label={m.admin_ban_reason_placeholder()} />
		</div>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>{m.common_cancel()}</AlertDialog.Cancel>
			<form method="POST" action="?/ban" use:enhance={handleBanResult}>
				<input type="hidden" name="userId" value={banTarget?.id ?? ''} />
				<input type="hidden" name="banReason" value={banReason} />
				<Button type="submit" variant="destructive">{m.admin_ban()}</Button>
			</form>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
