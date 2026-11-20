<script lang="ts">
	import { tick } from 'svelte';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { toast } from 'svelte-sonner';
	import { Table } from '$lib/components/ui/table';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { apiFetch } from '$lib/api-client';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import PageHeader from '$lib/components/patterns/PageHeader.svelte';
	import * as m from '$lib/paraglide/messages.js';

	type Member = { id: number; userName: string; userEmail: string; role: string };
	let {
		members,
		canManage,
		searchContext
	}: {
		members: Member[];
		canManage: boolean;
		searchContext: { teamId: number } | { excludeProjectId: number };
	} = $props();

	const isTeam = $derived('teamId' in searchContext);
	const defaultRole = $derived(isTeam ? 'MEMBER' : 'QA');
	const teamRoles = {
		OWNER: m.team_role_owner,
		ADMIN: m.team_role_admin,
		MEMBER: m.team_role_member
	};
	const roles = $derived(
		isTeam ? Object.keys(teamRoles) : ['PROJECT_ADMIN', 'QA', 'DEV', 'VIEWER']
	);

	function roleLabel(role: string) {
		return isTeam
			? (teamRoles[role as keyof typeof teamRoles]?.() ?? role)
			: role.replace('_', ' ');
	}
	type User = { id: string; name: string; email: string };
	type Change = { member: Member; role?: string };
	type Action = 'add' | 'role' | 'remove';

	let addOpen = $state(false);
	let confirmOpen = $state(false);
	let change = $state<Change | null>(null);
	let pending = $state(false);
	let error = $state('');
	let addButton = $state<HTMLButtonElement | null>(null);
	let memberTable = $state<HTMLTableElement | null>(null);
	let addError = $state<HTMLElement | null>(null);
	let confirmError = $state<HTMLElement | null>(null);
	let previousControl: HTMLElement | null = null;

	let searchQuery = $state('');
	let searchResults = $state<User[]>([]);
	let searchStatus = $state<'idle' | 'loading' | 'ready' | 'error'>('idle');
	let searchRetry = $state(0);
	let selectedUser = $state<User | null>(null);
	let selectedRole = $state('');
	let searchInput = $state<HTMLInputElement | null>(null);
	let roleInput = $state<HTMLSelectElement | null>(null);

	$effect(() => {
		const query = searchQuery.trim();
		if (!addOpen || selectedUser || query.length < 2) {
			searchResults = [];
			searchStatus = 'idle';
			return;
		}
		void searchRetry;
		const search = new URLSearchParams({ q: query });
		if ('teamId' in searchContext) search.set('teamId', String(searchContext.teamId));
		else search.set('excludeProjectId', String(searchContext.excludeProjectId));
		const controller = new AbortController();
		searchStatus = 'loading';
		searchResults = [];
		const timer = setTimeout(async () => {
			try {
				const response = await apiFetch<{ data: User[] }>(`/api/users/search?${search}`, {
					silent: true,
					signal: controller.signal
				});
				if (controller.signal.aborted) return;
				searchResults = response.data;
				searchStatus = 'ready';
			} catch {
				if (!controller.signal.aborted) searchStatus = 'error';
			}
		}, 300);

		return () => {
			clearTimeout(timer);
			controller.abort();
		};
	});

	async function chooseUser(user: User | null) {
		selectedUser = user;
		error = '';
		await tick();
		if (user) roleInput?.focus();
		else searchInput?.focus();
	}

	function confirm(next: Change, control: HTMLElement | null) {
		change = next;
		previousControl = control;
		error = '';
		confirmOpen = true;
	}

	function restoreFocus(event: Event) {
		event.preventDefault();
		const target = previousControl?.getClientRects().length
			? previousControl
			: (addButton ?? memberTable);
		target?.focus();
	}

	function failureMessage(action: Action, serverError: unknown) {
		if (
			serverError === 'Cannot demote the last project admin' ||
			serverError === 'Cannot remove the last project admin'
		)
			return m.members_last_admin();
		if (
			serverError === 'Cannot demote the last team owner' ||
			serverError === 'Cannot remove the last team owner'
		)
			return m.team_members_last_owner();
		if (action === 'add') return m.error_add_failed();
		if (action === 'role') return m.error_update_failed();
		return m.error_remove_failed();
	}

	function submit(action: Action): SubmitFunction {
		return ({ cancel }) => {
			if (pending) {
				cancel();
				return;
			}
			pending = true;
			error = '';
			return async ({ result, update }) => {
				try {
					if (result.type === 'redirect') {
						await update();
					} else if (result.type === 'success') {
						await invalidateAll();
						if (action === 'add') {
							toast.success(m.members_added());
							addOpen = false;
						} else {
							toast.success(action === 'role' ? m.members_role_updated() : m.members_removed());
							confirmOpen = false;
						}
					} else {
						error = failureMessage(
							action,
							result.type === 'failure' ? result.data?.error : undefined
						);
						await tick();
						(action === 'add' ? addError : confirmError)?.focus();
					}
				} finally {
					pending = false;
				}
			};
		};
	}
</script>

{#snippet roleOptions()}
	{#each roles as role (role)}
		<option value={role}>{roleLabel(role)}</option>
	{/each}
{/snippet}

{#snippet memberRole(member: Member)}
	{#if canManage}
		<select
			class="h-10 max-w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-2 focus-visible:outline-ring"
			aria-label={m.members_role_label({ name: member.userName })}
			value={member.role}
			onchange={(event) => {
				const control = event.currentTarget;
				const role = control.value;
				control.value = member.role;
				if (role !== member.role) confirm({ member, role }, control);
			}}
		>
			{@render roleOptions()}
		</select>
	{:else}
		<Badge variant="secondary">{roleLabel(member.role)}</Badge>
	{/if}
{/snippet}

{#snippet removeButton(member: Member)}
	<Button
		variant="outline"
		size="sm"
		class="min-h-10 text-destructive hover:text-destructive"
		aria-label={m.members_remove_label({ name: member.userName })}
		onclick={(event) => confirm({ member }, event.currentTarget)}>{m.members_remove()}</Button
	>
{/snippet}

<div class="space-y-4">
	<PageHeader
		title={m.members_title()}
		description={isTeam
			? canManage
				? m.team_members_manage_desc()
				: m.team_members_readonly()
			: canManage
				? m.members_desc()
				: m.members_readonly()}
	>
		{#snippet actions()}
			{#if canManage}
				<Dialog.Root
					bind:open={addOpen}
					onOpenChange={(open) => {
						if (!open) return;
						selectedUser = null;
						searchQuery = '';
						selectedRole = defaultRole;
						error = '';
					}}
				>
					<Dialog.Trigger>
						{#snippet child({ props })}
							<Button bind:ref={addButton} class="w-full sm:w-auto" {...props}
								>{m.members_add()}</Button
							>
						{/snippet}
					</Dialog.Trigger>
					<Dialog.Content
						class="sm:max-w-md"
						showCloseButton={!pending}
						escapeKeydownBehavior={pending ? 'ignore' : 'close'}
						interactOutsideBehavior={pending ? 'ignore' : 'close'}
					>
						<Dialog.Header>
							<Dialog.Title>{m.members_add_title()}</Dialog.Title>
							<Dialog.Description
								>{isTeam ? m.team_members_add_desc() : m.members_add_desc()}</Dialog.Description
							>
						</Dialog.Header>
						{#if selectedUser}
							<div class="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
								<div class="min-w-0 [overflow-wrap:anywhere]">
									<p class="font-medium">{selectedUser.name}</p>
									<p class="text-sm text-muted-foreground">{selectedUser.email}</p>
								</div>
								<Button
									variant="outline"
									size="sm"
									disabled={pending}
									onclick={() => chooseUser(null)}
								>
									{m.members_change()}
								</Button>
							</div>
							{#if error}
								<p role="alert" tabindex="-1" bind:this={addError} class="text-sm text-destructive">
									{error}
								</p>
							{/if}
							<form
								method="POST"
								action="?/addMember"
								use:enhance={submit('add')}
								class="space-y-4"
							>
								<input type="hidden" name="userId" value={selectedUser.id} />
								<input type="hidden" name="role" value={selectedRole} />
								<div class="space-y-2">
									<Label for="new-member-role">{m.common_role()}</Label>
									<select
										id="new-member-role"
										bind:this={roleInput}
										bind:value={selectedRole}
										class="h-10 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-2 focus-visible:outline-ring"
										disabled={pending}
									>
										{@render roleOptions()}
									</select>
								</div>
								<Dialog.Footer>
									<Dialog.Close disabled={pending}>
										{#snippet child({ props })}
											<Button type="button" variant="outline" {...props}>{m.common_cancel()}</Button
											>
										{/snippet}
									</Dialog.Close>
									<Button type="submit" disabled={pending}
										>{pending ? m.common_saving() : m.members_add()}</Button
									>
								</Dialog.Footer>
							</form>
						{:else}
							<div class="space-y-2">
								<Label for="member-search">{m.members_search_user()}</Label>
								<Input
									id="member-search"
									type="search"
									maxlength={100}
									bind:ref={searchInput}
									bind:value={searchQuery}
									aria-describedby="member-search-hint"
								/>
								<p id="member-search-hint" class="text-sm text-muted-foreground">
									{m.members_search_hint()}
								</p>
							</div>
							{#if searchStatus === 'error'}
								<p role="alert" class="text-sm text-destructive">{m.members_search_failed()}</p>
								<Button
									variant="outline"
									onclick={() => {
										searchRetry++;
										searchInput?.focus();
									}}>{m.my_work_retry()}</Button
								>
							{:else}
								<p role="status" class="text-sm text-muted-foreground empty:hidden">
									{searchStatus === 'loading'
										? m.common_loading()
										: searchStatus === 'ready'
											? searchResults.length
												? m.members_search_count({ count: searchResults.length })
												: m.members_no_users()
											: ''}
								</p>
								{#if searchResults.length}
									<ul class="max-h-56 divide-y overflow-y-auto rounded-md border">
										{#each searchResults as user (user.id)}
											<li>
												<button
													type="button"
													class="block w-full px-3 py-2 text-start text-sm [overflow-wrap:anywhere] hover:bg-accent focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
													onclick={() => chooseUser(user)}
												>
													<span class="block font-medium">{user.name}</span>
													<span class="block text-muted-foreground">{user.email}</span>
												</button>
											</li>
										{/each}
									</ul>
								{/if}
							{/if}
						{/if}
					</Dialog.Content>
				</Dialog.Root>
			{/if}
		{/snippet}
	</PageHeader>

	{#if members.length === 0}
		<p class="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
			{isTeam ? m.team_members_empty() : m.members_empty()}
		</p>
	{:else}
		<Table
			bind:ref={memberTable}
			role="table"
			tabindex={-1}
			class="table-fixed max-lg:block max-lg:[&_td:first-child]:pl-0 lg:[&_td]:p-2 lg:[&_th]:p-2"
			aria-label={m.members_title()}
		>
			<!-- svelte-ignore a11y_no_redundant_roles (Keep the table structure on narrow layouts.) -->
			<thead
				role="rowgroup"
				class="border-b bg-muted/40 text-start text-muted-foreground max-lg:sr-only"
			>
				<tr class="[&>th]:text-start [&>th]:font-medium">
					<th scope="col" role="columnheader" class="w-[28%]">{m.common_name()}</th>
					<th scope="col" role="columnheader">{m.common_email()}</th>
					<th scope="col" role="columnheader" class="w-40">{m.common_role()}</th>
					{#if canManage}<th scope="col" role="columnheader" class="w-24">{m.common_actions()}</th
						>{/if}
				</tr>
			</thead>
			<!-- svelte-ignore a11y_no_redundant_roles (Keep row groups when the body becomes a block.) -->
			<tbody role="rowgroup" class="divide-y max-lg:block">
				{#each members as member (member.id)}
					<!-- svelte-ignore a11y_no_redundant_roles (Keep row semantics when the row becomes a grid.) -->
					<tr role="row" class="max-lg:grid max-lg:grid-cols-[auto_1fr] max-lg:gap-2 max-lg:p-4">
						<td role="cell" class="col-span-2 font-medium [overflow-wrap:anywhere]"
							>{member.userName}</td
						>
						<td role="cell" class="col-span-2 text-muted-foreground [overflow-wrap:anywhere]"
							>{member.userEmail}</td
						>
						<td role="cell">{@render memberRole(member)}</td>
						{#if canManage}<td role="cell">{@render removeButton(member)}</td>{/if}
					</tr>
				{/each}
			</tbody>
		</Table>
	{/if}

	<AlertDialog.Root bind:open={confirmOpen}>
		{#if change}
			<AlertDialog.Content
				onCloseAutoFocus={restoreFocus}
				escapeKeydownBehavior={pending ? 'ignore' : 'close'}
			>
				<AlertDialog.Header>
					<AlertDialog.Title
						>{change.role
							? m.members_role_change_title()
							: m.members_remove_title()}</AlertDialog.Title
					>
					<AlertDialog.Description class="[overflow-wrap:anywhere]">
						{change.role
							? m.members_role_change_confirm({
									name: change.member.userName,
									role: roleLabel(change.role)
								})
							: isTeam
								? m.team_members_remove_confirm({ name: change.member.userName })
								: m.members_remove_confirm({ name: change.member.userName })}
					</AlertDialog.Description>
				</AlertDialog.Header>
				{#if error}
					<p role="alert" tabindex="-1" bind:this={confirmError} class="text-sm text-destructive">
						{error}
					</p>
				{/if}
				<AlertDialog.Footer>
					<AlertDialog.Cancel disabled={pending}>{m.common_cancel()}</AlertDialog.Cancel>
					<form
						method="POST"
						action={change.role ? '?/updateRole' : '?/removeMember'}
						use:enhance={submit(change.role ? 'role' : 'remove')}
					>
						<input type="hidden" name="memberId" value={change.member.id} />
						{#if change.role}<input type="hidden" name="role" value={change.role} />{/if}
						<Button
							class="w-full sm:w-auto"
							type="submit"
							variant={change.role ? 'default' : 'destructive'}
							disabled={pending}
						>
							{pending
								? m.common_saving()
								: change.role
									? m.members_role_change_action()
									: m.members_remove()}
						</Button>
					</form>
				</AlertDialog.Footer>
			</AlertDialog.Content>
		{/if}
	</AlertDialog.Root>
</div>
