<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { enhance as formEnhance } from '$app/forms';
	import { superForm } from 'sveltekit-superforms';
	import { zodClient } from 'sveltekit-superforms/adapters';
	import { updateTestCaseSchema } from '$lib/schemas/test-case.schema';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { toast } from 'svelte-sonner';
	import StepsEditor from '$lib/components/StepsEditor.svelte';
	import AttachmentManager from '$lib/components/AttachmentManager.svelte';
	import TagBadge from '$lib/components/TagBadge.svelte';
	import * as Select from '$lib/components/ui/select/index.js';
	import * as m from '$lib/paraglide/messages.js';

	let { data } = $props();

	let editing = $state(false);
	let deleteDialogOpen = $state(false);
	let showVersions = $state(false);
	let lockHolder = $state<{ userName: string } | null>(null);

	// @ts-ignore zod 3.24 type mismatch with superforms adapter
	const validators = zodClient(updateTestCaseSchema);
	const { form, errors, enhance, submitting, reset } = superForm(data.form, {
		validators,
		dataType: 'json',
		onUpdated({ form }) {
			if (form.message) {
				if (form.valid) {
					toast.success(form.message);
					editing = false;
					releaseLock();
				} else {
					toast.error(form.message);
				}
			}
		}
	});

	const tc = $derived(data.testCaseDetail);
	const version = $derived(tc.latestVersion);
	const canEdit = $derived(data.userRole !== 'VIEWER');
	const canDelete = $derived(data.userRole === 'PROJECT_ADMIN' || data.userRole === 'ADMIN');
	const basePath = $derived(`/projects/${data.project.id}/test-cases`);

	async function cloneTestCase() {
		try {
			const res = await fetch(
				`/api/projects/${data.project.id}/test-cases/${tc.id}/clone`,
				{ method: 'POST' }
			);
			if (res.ok) {
				const result = await res.json();
				toast.success(m.tc_cloned());
				goto(`${basePath}/${result.newTestCaseId}`);
			} else {
				const err = await res.json();
				toast.error(err.error || 'Failed to clone');
			}
		} catch {
			toast.error('Failed to clone');
		}
	}

	const lockUrl = $derived(
		`/api/projects/${data.project.id}/test-cases/${tc.id}/lock`
	);

	// Check lock status on load
	$effect(() => {
		fetch(lockUrl)
			.then((r) => r.json())
			.then((d) => {
				if (d.locked) lockHolder = d.holder;
			})
			.catch(() => {});
	});

	// Heartbeat while editing
	$effect(() => {
		if (!editing) return;
		const interval = setInterval(() => {
			fetch(lockUrl, { method: 'PUT' }).catch(() => {});
		}, 60_000);
		return () => clearInterval(interval);
	});

	// Release lock on page unload
	$effect(() => {
		if (!editing) return;
		const handler = () => {
			fetch(lockUrl, { method: 'DELETE', keepalive: true }).catch(() => {});
		};
		window.addEventListener('beforeunload', handler);
		return () => window.removeEventListener('beforeunload', handler);
	});

	async function startEdit() {
		const res = await fetch(lockUrl, { method: 'POST' });
		const result = await res.json();
		if (!res.ok) {
			toast.error(m.lock_conflict({ name: result.holder?.userName ?? '?' }));
			lockHolder = result.holder;
			return;
		}
		lockHolder = null;
		reset();
		editing = true;
	}

	async function cancelEdit() {
		reset();
		editing = false;
		await releaseLock();
	}

	async function releaseLock() {
		await fetch(lockUrl, { method: 'DELETE' }).catch(() => {});
		lockHolder = null;
	}

	function priorityVariant(
		p: string
	): 'default' | 'secondary' | 'outline' | 'destructive' {
		switch (p) {
			case 'CRITICAL':
				return 'destructive';
			case 'HIGH':
				return 'default';
			case 'MEDIUM':
				return 'secondary';
			default:
				return 'outline';
		}
	}
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<a href={basePath} class="text-muted-foreground hover:text-foreground text-sm"
				>&larr; {m.common_back_to({ target: m.tc_title() })}</a
			>
			<div class="mt-1 flex items-center gap-3">
				<h2 class="text-xl font-bold">{tc.key}</h2>
				{#if version}
					<Badge variant={priorityVariant(version.priority)}>{version.priority}</Badge>
				{/if}
			</div>
		</div>
		<div class="flex items-center gap-2">
			{#if lockHolder && !editing}
				<span class="text-xs text-orange-600">
					{m.lock_editing_by({ name: lockHolder.userName })}
				</span>
			{/if}
			<Button variant="outline" size="sm" onclick={() => (showVersions = !showVersions)}>
				{showVersions ? m.tc_detail_hide_history() : m.tc_detail_version_history()}
			</Button>
			{#if canEdit && !editing}
				<Button variant="outline" size="sm" onclick={cloneTestCase}>
					<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-1"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
					{m.tc_clone()}
				</Button>
				<Button size="sm" onclick={startEdit}>{m.common_edit()}</Button>
			{/if}
			{#if canDelete && !editing}
				<AlertDialog.Root bind:open={deleteDialogOpen}>
					<AlertDialog.Trigger>
						{#snippet child({ props })}
							<Button variant="destructive" size="sm" {...props}>{m.common_delete()}</Button>
						{/snippet}
					</AlertDialog.Trigger>
					<AlertDialog.Portal>
						<AlertDialog.Overlay />
						<AlertDialog.Content>
							<AlertDialog.Header>
								<AlertDialog.Title>{m.tc_detail_delete_title()}</AlertDialog.Title>
								<AlertDialog.Description>
									{m.tc_detail_delete_confirm({ key: tc.key })}
								</AlertDialog.Description>
							</AlertDialog.Header>
							<AlertDialog.Footer>
								<AlertDialog.Cancel>{m.common_cancel()}</AlertDialog.Cancel>
								<form
									method="POST"
									action="?/delete"
									use:formEnhance={() => {
										return async ({ result }) => {
											if (result.type === 'success') {
												toast.success(m.tc_deleted());
												goto(basePath);
											} else {
												toast.error('Failed to delete test case');
											}
										};
									}}
								>
									<Button type="submit" variant="destructive">{m.common_delete()}</Button>
								</form>
							</AlertDialog.Footer>
						</AlertDialog.Content>
					</AlertDialog.Portal>
				</AlertDialog.Root>
			{/if}
		</div>
	</div>

	<div class="grid gap-6 {showVersions ? 'lg:grid-cols-[1fr_300px]' : ''}">
		<!-- Main Content -->
		<div>
			<!-- Tags Section -->
			{#if !editing}
				<div class="mb-4 flex flex-wrap items-center gap-2">
					{#each data.assignedTags as t (t.id)}
						{#if canEdit}
							<form method="POST" action="?/removeTag" use:formEnhance={() => {
								return async ({ result, update }) => {
									if (result.type === 'success') {
										toast.success(m.tag_removed());
										await update();
									}
								};
							}} class="inline-flex">
								<input type="hidden" name="tagId" value={t.id} />
								<span class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium">
									<span class="h-2 w-2 rounded-full" style="background-color: {t.color}"></span>
									{t.name}
									<button type="submit" class="text-muted-foreground hover:text-foreground ml-0.5">&times;</button>
								</span>
							</form>
						{:else}
							<TagBadge name={t.name} color={t.color} />
						{/if}
					{/each}
					{#if canEdit}
						{@const unassignedTags = data.projectTags.filter(
							(pt) => !data.assignedTags.some((at) => at.id === pt.id)
						)}
						{#if unassignedTags.length > 0}
							<form method="POST" action="?/assignTag" use:formEnhance={() => {
								return async ({ result, update }) => {
									if (result.type === 'success') {
										toast.success(m.tag_assigned());
										await update();
									}
								};
							}} class="inline-flex">
								<input type="hidden" name="tagId" value="" />
								<Select.Root
									type="single"
									value=""
									onValueChange={(v: string) => {
										if (!v) return;
										const form = document.querySelector<HTMLFormElement>('form[action="?/assignTag"]');
										if (form) {
											const hidden = form.querySelector<HTMLInputElement>('input[name="tagId"]');
											if (hidden) hidden.value = v;
											form.requestSubmit();
										}
									}}
								>
									<Select.Trigger size="sm" class="h-7 px-2 text-xs">
										+ {m.tag_assign()}
									</Select.Trigger>
									<Select.Content>
										{#each unassignedTags as t (t.id)}
											<Select.Item value={String(t.id)} label={t.name} />
										{/each}
									</Select.Content>
								</Select.Root>
							</form>
						{/if}
					{/if}
				</div>

				<!-- Assignees Section -->
				<div class="mb-4 flex flex-wrap items-center gap-2">
					<span class="text-xs font-medium text-muted-foreground mr-1">{m.assignee_title()}:</span>
					{#each data.assignedAssignees as a (a.userId)}
						{#if canEdit}
							<form method="POST" action="?/removeAssignee" use:formEnhance={() => {
								return async ({ result, update }) => {
									if (result.type === 'success') {
										toast.success(m.assignee_removed());
										await update();
									}
								};
							}} class="inline-flex">
								<input type="hidden" name="userId" value={a.userId} />
								<span class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium">
									{a.userName}
									<button type="submit" class="text-muted-foreground hover:text-foreground ml-0.5">&times;</button>
								</span>
							</form>
						{:else}
							<Badge variant="outline" class="text-xs">{a.userName}</Badge>
						{/if}
					{/each}
					{#if canEdit}
						{@const unassignedMembers = data.projectMembers.filter(
							(pm) => !data.assignedAssignees.some((a) => a.userId === pm.userId)
						)}
						{#if unassignedMembers.length > 0}
							<form method="POST" action="?/assignAssignee" use:formEnhance={() => {
								return async ({ result, update }) => {
									if (result.type === 'success') {
										toast.success(m.assignee_assigned());
										await update();
									}
								};
							}} class="inline-flex">
								<input type="hidden" name="userId" value="" />
								<Select.Root
									type="single"
									value=""
									onValueChange={(v: string) => {
										if (!v) return;
										const form = document.querySelector<HTMLFormElement>('form[action="?/assignAssignee"]');
										if (form) {
											const hidden = form.querySelector<HTMLInputElement>('input[name="userId"]');
											if (hidden) hidden.value = v;
											form.requestSubmit();
										}
									}}
								>
									<Select.Trigger size="sm" class="h-7 px-2 text-xs">
										+ {m.assignee_assign()}
									</Select.Trigger>
									<Select.Content>
										{#each unassignedMembers as member (member.userId)}
											<Select.Item value={member.userId} label={member.userName} />
										{/each}
									</Select.Content>
								</Select.Root>
							</form>
						{/if}
					{/if}
				</div>
			{/if}

			{#if editing}
				<!-- Edit Mode -->
				<Card.Root>
					<Card.Header>
						<Card.Title>{m.tc_detail_edit()}</Card.Title>
					</Card.Header>
					<Card.Content>
						<form method="POST" action="?/update" use:enhance class="space-y-6">
							<div class="space-y-2">
								<Label for="title">{m.tc_title_label()}</Label>
								<Input id="title" name="title" bind:value={$form.title} />
								{#if $errors.title}
									<p class="text-destructive text-sm">{$errors.title}</p>
								{/if}
							</div>

							<div class="space-y-2">
								<Label>{m.common_priority()}</Label>
								<input type="hidden" name="priority" value={$form.priority} />
								<Select.Root
									type="single"
									value={$form.priority as string}
									onValueChange={(v: string) => { $form.priority = v; }}
								>
									<Select.Trigger class="w-full">
										{$form.priority === 'LOW' ? m.priority_low() : $form.priority === 'MEDIUM' ? m.priority_medium() : $form.priority === 'HIGH' ? m.priority_high() : m.priority_critical()}
									</Select.Trigger>
									<Select.Content>
										<Select.Item value="LOW" label={m.priority_low()} />
										<Select.Item value="MEDIUM" label={m.priority_medium()} />
										<Select.Item value="HIGH" label={m.priority_high()} />
										<Select.Item value="CRITICAL" label={m.priority_critical()} />
									</Select.Content>
								</Select.Root>
							</div>

							<div class="space-y-2">
								<Label for="precondition">{m.tc_precondition()}</Label>
								<Textarea
									id="precondition"
									name="precondition"
									value={$form.precondition as string}
									oninput={(e) => {
										$form.precondition = e.currentTarget.value;
									}}
									rows={3}
								/>
							</div>

							<StepsEditor
								value={($form.steps ?? []) as { action: string; expected: string }[]}
								onchange={(s) => {
									// @ts-ignore zod 3.24 type mismatch
									$form.steps = s;
								}}
							/>

							<div class="space-y-2">
								<Label for="expectedResult">{m.tc_expected_result()}</Label>
								<Textarea
									id="expectedResult"
									name="expectedResult"
									value={$form.expectedResult as string}
									oninput={(e) => {
										$form.expectedResult = e.currentTarget.value;
									}}
									rows={3}
								/>
							</div>

							<div class="flex gap-3">
								<Button type="submit" disabled={$submitting}>
									{$submitting ? m.common_saving() : m.common_save_changes()}
								</Button>
								<Button type="button" variant="outline" onclick={cancelEdit}>{m.common_cancel()}</Button>
							</div>
						</form>
					</Card.Content>
				</Card.Root>
			{:else}
				<!-- View Mode -->
				<Card.Root>
					<Card.Header>
						<Card.Title>{version?.title ?? m.tc_detail_untitled()}</Card.Title>
						<Card.Description>
							{m.tc_detail_version({ version: version?.versionNo ?? 0 })} &middot; Created {new Date(
								tc.createdAt
							).toLocaleDateString()}
						</Card.Description>
					</Card.Header>
					<Card.Content class="space-y-6">
						{#if version?.precondition}
							<div>
								<h4 class="text-sm font-medium">{m.tc_precondition()}</h4>
								<p class="text-muted-foreground mt-1 whitespace-pre-wrap text-sm">
									{version.precondition}
								</p>
							</div>
						{/if}

						{#if version?.steps && version.steps.length > 0}
							<div>
								<h4 class="text-sm font-medium">{m.tc_detail_steps()}</h4>
								<div class="mt-2 space-y-2">
									{#each version.steps as step, i (step.order)}
										<div class="rounded-md border p-3">
											<div class="text-muted-foreground mb-1 text-xs font-medium">
												{m.tc_detail_step_n({ n: step.order })}
											</div>
											<div class="grid gap-2 sm:grid-cols-2">
												<div>
													<span class="text-muted-foreground text-xs">{m.tc_detail_action()}:</span>
													<p class="text-sm">{step.action}</p>
												</div>
												{#if step.expected}
													<div>
														<span class="text-muted-foreground text-xs">{m.tc_detail_expected()}:</span>
														<p class="text-sm">{step.expected}</p>
													</div>
												{/if}
											</div>
										</div>
									{/each}
								</div>
							</div>
						{/if}

						{#if version?.expectedResult}
							<div>
								<h4 class="text-sm font-medium">{m.tc_expected_result()}</h4>
								<p class="text-muted-foreground mt-1 whitespace-pre-wrap text-sm">
									{version.expectedResult}
								</p>
							</div>
						{/if}
					</Card.Content>
				</Card.Root>
			{/if}

			<!-- Attachments -->
			<Card.Root>
				<Card.Content class="pt-6">
					<AttachmentManager
						referenceType="TESTCASE"
						referenceId={tc.id}
						editable={canEdit}
					/>
				</Card.Content>
			</Card.Root>
		</div>

		<!-- Version History Sidebar -->
		{#if showVersions}
			<Card.Root class="h-fit">
				<Card.Header>
					<Card.Title class="text-base">{m.tc_detail_version_history()}</Card.Title>
				</Card.Header>
				<Card.Content>
					{#if data.versions.length === 0}
						<p class="text-muted-foreground text-sm">{m.tc_detail_no_versions()}</p>
					{:else}
						<div class="space-y-3">
							{#each data.versions as v (v.id)}
								<div
									class="rounded-md border p-3 {v.id === tc.latestVersion?.id
										? 'border-primary bg-primary/5'
										: ''}"
								>
									<div class="flex items-center justify-between">
										<span class="text-sm font-medium">v{v.versionNo}</span>
										<Badge variant={priorityVariant(v.priority)} class="text-xs">
											{v.priority}
										</Badge>
									</div>
									<p class="mt-1 text-sm">{v.title}</p>
									<div class="text-muted-foreground mt-1 text-xs">
										{v.updatedBy} &middot; {new Date(v.createdAt).toLocaleDateString()}
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</Card.Content>
			</Card.Root>
		{/if}
	</div>
</div>
