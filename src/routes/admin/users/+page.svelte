<script lang="ts">
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
				toast.success('Updated successfully');
				await invalidateAll();
			} else if (result.type === 'failure') {
				toast.error((result.data?.error as string) ?? 'Operation failed');
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
				toast.success('User banned');
				await invalidateAll();
			} else if (result.type === 'failure') {
				toast.error((result.data?.error as string) ?? 'Failed to ban user');
				await update();
			}
		};
	}

	const currentUserId = $derived((page.data as Record<string, unknown>).user as { id: string } | null);
</script>

<div class="space-y-4">
	<!-- Search -->
	<form onsubmit={(e) => { e.preventDefault(); doSearch(); }} class="flex gap-2">
		<Input placeholder="Search by name or email..." class="max-w-sm" bind:value={searchInput} />
		<Button type="submit" variant="outline">Search</Button>
	</form>

	<!-- Users Table -->
	<Card.Root>
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head>Name</Table.Head>
					<Table.Head>Email</Table.Head>
					<Table.Head class="w-28">Role</Table.Head>
					<Table.Head class="w-24">Status</Table.Head>
					<Table.Head class="w-32">Created</Table.Head>
					<Table.Head class="w-40">Actions</Table.Head>
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
								<Badge variant="destructive">Banned</Badge>
							{:else}
								<Badge variant="outline">Active</Badge>
							{/if}
						</Table.Cell>
						<Table.Cell class="text-muted-foreground text-xs">
							{new Date(u.createdAt).toLocaleDateString()}
						</Table.Cell>
						<Table.Cell>
							{#if u.id !== currentUserId?.id}
								<div class="flex gap-1">
									{#if u.role !== 'admin'}
										<form method="POST" action="?/updateRole" use:enhance={handleResult}>
											<input type="hidden" name="userId" value={u.id} />
											<input type="hidden" name="role" value="admin" />
											<Button type="submit" variant="ghost" size="sm" class="h-7 px-2 text-xs">
												Make Admin
											</Button>
										</form>
									{:else}
										<form method="POST" action="?/updateRole" use:enhance={handleResult}>
											<input type="hidden" name="userId" value={u.id} />
											<input type="hidden" name="role" value="user" />
											<Button type="submit" variant="ghost" size="sm" class="h-7 px-2 text-xs">
												Remove Admin
											</Button>
										</form>
									{/if}
									{#if u.banned}
										<form method="POST" action="?/unban" use:enhance={handleResult}>
											<input type="hidden" name="userId" value={u.id} />
											<Button type="submit" variant="ghost" size="sm" class="h-7 px-2 text-xs text-green-600">
												Unban
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
											Ban
										</Button>
									{/if}
								</div>
							{:else}
								<span class="text-muted-foreground text-xs">You</span>
							{/if}
						</Table.Cell>
					</Table.Row>
				{/each}
				{#if data.users.length === 0}
					<Table.Row>
						<Table.Cell colspan={6} class="text-muted-foreground text-center">
							No users found.
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
				{data.pagination.total} users total
			</p>
			<div class="flex gap-2">
				{#if data.pagination.page > 1}
					<Button
						variant="outline"
						size="sm"
						href="/admin/users?page={data.pagination.page - 1}{data.search ? `&search=${data.search}` : ''}"
					>
						Previous
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
						Next
					</Button>
				{/if}
			</div>
		</div>
	{/if}
</div>

<!-- Ban Dialog -->
<AlertDialog.Root bind:open={banDialogOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Ban User</AlertDialog.Title>
			<AlertDialog.Description>
				Are you sure you want to ban "{banTarget?.name}"? They will not be able to log in.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<div class="py-3">
			<Input placeholder="Ban reason (optional)" bind:value={banReason} />
		</div>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			<form method="POST" action="?/ban" use:enhance={handleBanResult}>
				<input type="hidden" name="userId" value={banTarget?.id ?? ''} />
				<input type="hidden" name="banReason" value={banReason} />
				<Button type="submit" variant="destructive">Ban</Button>
			</form>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
