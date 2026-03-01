<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';

	let { data } = $props();

	const roles = ['PROJECT_ADMIN', 'QA', 'DEV', 'VIEWER'] as const;

	// Add member dialog
	let addDialogOpen = $state(false);
	let searchQuery = $state('');
	let searchResults = $state<{ id: string; name: string; email: string }[]>([]);
	let selectedUser = $state<{ id: string; name: string; email: string } | null>(null);
	let selectedRole = $state<string>('QA');
	let searching = $state(false);
	let searchTimeout: ReturnType<typeof setTimeout>;

	// Remove member dialog
	let removeMemberId = $state<number | null>(null);
	let removeMemberName = $state('');
	let removeDialogOpen = $state(false);

	function handleSearch() {
		clearTimeout(searchTimeout);
		if (searchQuery.length < 2) {
			searchResults = [];
			return;
		}
		searchTimeout = setTimeout(async () => {
			searching = true;
			try {
				const res = await fetch(
					`/api/users/search?q=${encodeURIComponent(searchQuery)}&excludeProjectId=${data.project.id}`
				);
				const json = await res.json();
				searchResults = json.data;
			} finally {
				searching = false;
			}
		}, 300);
	}

	function selectUser(u: { id: string; name: string; email: string }) {
		selectedUser = u;
		searchQuery = '';
		searchResults = [];
	}

	function resetAddDialog() {
		selectedUser = null;
		searchQuery = '';
		searchResults = [];
		selectedRole = 'QA';
	}

	function openRemoveDialog(memberId: number, memberName: string) {
		removeMemberId = memberId;
		removeMemberName = memberName;
		removeDialogOpen = true;
	}

	function roleBadgeVariant(role: string): 'default' | 'secondary' | 'outline' {
		if (role === 'PROJECT_ADMIN') return 'default';
		return 'secondary';
	}
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h2 class="text-lg font-semibold">Members</h2>
			<p class="text-muted-foreground text-sm">Manage project team members and their roles</p>
		</div>

		<Dialog.Root bind:open={addDialogOpen} onOpenChange={(open) => { if (!open) resetAddDialog(); }}>
			<Dialog.Trigger>
				{#snippet child({ props })}
					<Button {...props}>Add Member</Button>
				{/snippet}
			</Dialog.Trigger>
			<Dialog.Portal>
				<Dialog.Overlay />
				<Dialog.Content class="sm:max-w-md">
					<Dialog.Header>
						<Dialog.Title>Add Member</Dialog.Title>
						<Dialog.Description>Search for a user to add to this project</Dialog.Description>
					</Dialog.Header>

					<div class="space-y-4 py-4">
						{#if selectedUser}
							<div class="flex items-center justify-between rounded-md border p-3">
								<div>
									<p class="font-medium">{selectedUser.name}</p>
									<p class="text-muted-foreground text-sm">{selectedUser.email}</p>
								</div>
								<Button variant="ghost" size="sm" onclick={() => (selectedUser = null)}>
									Change
								</Button>
							</div>
						{:else}
							<div class="space-y-2">
								<Label>Search User</Label>
								<Input
									placeholder="Search by name or email..."
									bind:value={searchQuery}
									oninput={handleSearch}
								/>
								{#if searchResults.length > 0}
									<div class="max-h-48 overflow-y-auto rounded-md border">
										{#each searchResults as u}
											<button
												type="button"
												class="hover:bg-accent w-full px-3 py-2 text-left text-sm"
												onclick={() => selectUser(u)}
											>
												<div class="font-medium">{u.name}</div>
												<div class="text-muted-foreground text-xs">{u.email}</div>
											</button>
										{/each}
									</div>
								{:else if searchQuery.length >= 2 && !searching}
									<p class="text-muted-foreground text-sm">No users found</p>
								{/if}
							</div>
						{/if}

						<div class="space-y-2">
							<Label>Role</Label>
							<select
								bind:value={selectedRole}
								class="border-input bg-background ring-offset-background focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
							>
								{#each roles as r}
									<option value={r}>{r.replace('_', ' ')}</option>
								{/each}
							</select>
						</div>
					</div>

					{#if selectedUser}
						<Dialog.Footer>
							<form
								method="POST"
								action="?/addMember"
								use:enhance={() => {
									return async ({ result, update }) => {
										if (result.type === 'success' || result.type === 'redirect') {
											toast.success('Member added successfully');
											addDialogOpen = false;
											resetAddDialog();
											await invalidateAll();
										} else {
											toast.error('Failed to add member');
											await update();
										}
									};
								}}
							>
								<input type="hidden" name="userId" value={selectedUser.id} />
								<input type="hidden" name="role" value={selectedRole} />
								<Button type="submit">Add Member</Button>
							</form>
						</Dialog.Footer>
					{/if}
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>
	</div>

	<Card.Root>
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head>Name</Table.Head>
					<Table.Head>Email</Table.Head>
					<Table.Head>Role</Table.Head>
					<Table.Head class="w-24">Actions</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each data.members as member}
					<Table.Row>
						<Table.Cell class="font-medium">{member.userName}</Table.Cell>
						<Table.Cell class="text-muted-foreground">{member.userEmail}</Table.Cell>
						<Table.Cell>
							<form
								method="POST"
								action="?/updateRole"
								use:enhance={() => {
									return async ({ result, update }) => {
										if (result.type === 'success') {
											toast.success('Role updated');
											await invalidateAll();
										} else if (result.type === 'failure') {
											toast.error(result.data?.error as string ?? 'Failed to update role');
											await update();
										}
									};
								}}
							>
								<input type="hidden" name="memberId" value={member.id} />
								<select
									name="role"
									value={member.role}
									onchange={(e) => e.currentTarget.form?.requestSubmit()}
									class="border-input bg-background ring-offset-background focus-visible:ring-ring flex h-8 rounded-md border px-2 py-1 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
								>
									{#each roles as r}
										<option value={r} selected={r === member.role}>{r.replace('_', ' ')}</option>
									{/each}
								</select>
							</form>
						</Table.Cell>
						<Table.Cell>
							<Button
								variant="ghost"
								size="sm"
								class="text-destructive hover:text-destructive"
								onclick={() => openRemoveDialog(member.id, member.userName)}
							>
								Remove
							</Button>
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</Card.Root>

	<!-- Remove Member Dialog -->
	<AlertDialog.Root bind:open={removeDialogOpen}>
		<AlertDialog.Portal>
			<AlertDialog.Overlay />
			<AlertDialog.Content>
				<AlertDialog.Header>
					<AlertDialog.Title>Remove Member</AlertDialog.Title>
					<AlertDialog.Description>
						Are you sure you want to remove {removeMemberName} from this project? They will lose all access.
					</AlertDialog.Description>
				</AlertDialog.Header>
				<AlertDialog.Footer>
					<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
					<form
						method="POST"
						action="?/removeMember"
						use:enhance={() => {
							return async ({ result, update }) => {
								if (result.type === 'success') {
									toast.success('Member removed');
									removeDialogOpen = false;
									await invalidateAll();
								} else if (result.type === 'failure') {
									toast.error(result.data?.error as string ?? 'Failed to remove member');
									await update();
								}
							};
						}}
					>
						<input type="hidden" name="memberId" value={removeMemberId} />
						<Button type="submit" variant="destructive">Remove</Button>
					</form>
				</AlertDialog.Footer>
			</AlertDialog.Content>
		</AlertDialog.Portal>
	</AlertDialog.Root>
</div>
