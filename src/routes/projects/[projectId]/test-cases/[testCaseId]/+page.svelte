<script lang="ts">
	import { goto } from '$app/navigation';
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
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { toast } from 'svelte-sonner';
	import StepsEditor from '$lib/components/StepsEditor.svelte';
	import AttachmentManager from '$lib/components/AttachmentManager.svelte';
	import TagBadge from '$lib/components/TagBadge.svelte';
	import CommentSection from '$lib/components/CommentSection.svelte';
	import * as Select from '$lib/components/ui/select/index.js';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import SaveAsTemplateDialog from '../SaveAsTemplateDialog.svelte';
	import UnsavedChangesGuard from '$lib/components/UnsavedChangesGuard.svelte';
	import ParameterDataSection from '$lib/components/ParameterDataSection.svelte';
	import * as m from '$lib/paraglide/messages.js';
	import { apiPost, apiDelete } from '$lib/api-client';
	import PriorityBadge from '$lib/components/PriorityBadge.svelte';

	let { data } = $props();

	let editing = $state(false);
	let deleteDialogOpen = $state(false);
	let showVersions = $state(false);
	let lockHolder = $state<{ userName: string } | null>(null);
	let saveAsTemplateOpen = $state(false);

	// Issue links
	interface IssueLinkRecord {
		id: number;
		externalUrl: string;
		externalKey: string | null;
		title: string | null;
		status: string | null;
		provider: string;
	}
	let issueLinks = $state<IssueLinkRecord[]>(data.issueLinks as IssueLinkRecord[]);
	let showLinkForm = $state(false);
	let newIssueUrl = $state('');
	let linkingIssue = $state(false);
	let creatingIssue = $state(false);
	let deleteIssueLinkId = $state<number | null>(null);
	let syncingLinkId = $state<number | null>(null);
	let syncingAll = $state(false);

	function issueStatusClass(status: string | null): string {
		if (!status) return '';
		const lower = status.toLowerCase();
		if (['closed', 'done', 'resolved'].some((s) => lower.includes(s)))
			return 'bg-green-100 text-green-700 border-green-300';
		if (['progress', 'review', 'testing'].some((s) => lower.includes(s)))
			return 'bg-yellow-100 text-yellow-700 border-yellow-300';
		return 'bg-blue-100 text-blue-700 border-blue-300';
	}

	async function handleSyncIssueLink(linkId: number) {
		if (syncingLinkId) return;
		syncingLinkId = linkId;
		try {
			const result = await apiPost<IssueLinkRecord>(
				`/api/projects/${data.project.id}/issue-links/${linkId}/sync`,
				{}
			);
			issueLinks = issueLinks.map((l) => (l.id === linkId ? { ...l, status: result.status } : l));
			toast.success(m.issue_link_synced());
		} catch {
			toast.error(m.issue_link_sync_failed());
		} finally {
			syncingLinkId = null;
		}
	}

	async function handleSyncAllIssueLinks() {
		if (syncingAll) return;
		syncingAll = true;
		try {
			const result = await apiPost<{ synced: number; failed: number; total: number }>(
				`/api/projects/${data.project.id}/issue-links/sync?testCaseId=${tc.id}`,
				{}
			);
			toast.success(m.issue_link_sync_result({ synced: String(result.synced), total: String(result.total) }));
			// Reload the page data to get updated statuses
			const { invalidateAll } = await import('$app/navigation');
			await invalidateAll();
			issueLinks = data.issueLinks as IssueLinkRecord[];
		} catch {
			toast.error(m.issue_link_sync_failed());
		} finally {
			syncingAll = false;
		}
	}

	async function handleLinkIssue() {
		if (linkingIssue || !newIssueUrl.trim()) return;
		linkingIssue = true;
		try {
			const created = await apiPost<IssueLinkRecord>(
				`/api/projects/${data.project.id}/issue-links`,
				{ testCaseId: tc.id, externalUrl: newIssueUrl.trim() }
			);
			issueLinks = [created, ...issueLinks];
			newIssueUrl = '';
			showLinkForm = false;
			toast.success(m.issue_link_linked());
		} catch {
			// handled
		} finally {
			linkingIssue = false;
		}
	}

	async function handleCreateIssue() {
		if (creatingIssue) return;
		creatingIssue = true;
		try {
			const created = await apiPost<IssueLinkRecord>(
				`/api/projects/${data.project.id}/issue-links/create-issue`,
				{
					testCaseId: tc.id,
					title: `[${tc.key}] ${version?.title ?? 'Test failure'}`,
					description: `Test case ${tc.key} requires attention.\n\nTitle: ${version?.title ?? ''}\nPriority: ${version?.priority ?? ''}`
				}
			);
			issueLinks = [created, ...issueLinks];
			toast.success(m.issue_link_created());
		} catch {
			// handled
		} finally {
			creatingIssue = false;
		}
	}

	async function handleRemoveIssueLink() {
		if (!deleteIssueLinkId) return;
		const id = deleteIssueLinkId;
		try {
			await apiDelete(
				`/api/projects/${data.project.id}/issue-links/${id}`
			);
			issueLinks = issueLinks.filter((l) => l.id !== id);
			toast.success(m.issue_link_removed());
		} catch {
			// handled
		} finally {
			deleteIssueLinkId = null;
		}
	}

	// Inline tag creation
	let tagSearchInput = $state('');
	let showTagCreator = $state(false);

	const TAG_PALETTE = [
		'#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6',
		'#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#6b7280'
	];
	let newTagColor = $state(TAG_PALETTE[0]);

	// @ts-expect-error zod 3.x safeParse return type mismatch with superforms adapter
	const validators = zodClient(updateTestCaseSchema);
	const { form, errors, enhance, submitting, reset, tainted } = superForm(data.form, {
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

	const editDirty = $derived(editing && !!$tainted);

	const tc = $derived(data.testCaseDetail);
	const version = $derived(tc.latestVersion);
	const canEdit = $derived(data.userRole !== 'VIEWER');
	const canDelete = $derived(data.userRole === 'PROJECT_ADMIN' || data.userRole === 'ADMIN');
	const basePath = $derived(`/projects/${data.project.id}/test-cases`);
	const customFieldDefs = $derived(data.customFieldDefs ?? []);
	const customFieldValues = $derived((version?.customFields ?? {}) as Record<string, unknown>);

	function getCustomFieldFormValues(): Record<string, unknown> {
		return ($form.customFields ?? {}) as Record<string, unknown>;
	}

	function setCustomFieldValue(key: string, value: unknown) {
		const current = getCustomFieldFormValues();
		current[key] = value;
		($form as Record<string, unknown>).customFields = { ...current };
	}

	function getCustomFieldValue(key: string): unknown {
		return getCustomFieldFormValues()[key];
	}

	async function cloneTestCase() {
		try {
			const result = await apiPost<{ newTestCaseId: number }>(`/api/projects/${data.project.id}/test-cases/${tc.id}/clone`, {});
			toast.success(m.tc_cloned());
			goto(`${basePath}/${result.newTestCaseId}`);
		} catch {
			// error toast handled by apiPost
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

	function getPriorityColor(name: string): string {
		return data.projectPriorities.find((p) => p.name === name)?.color ?? '#6b7280';
	}
</script>

<UnsavedChangesGuard dirty={editDirty && !$submitting} />

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<div>
			<nav class="flex items-center gap-1 text-sm text-muted-foreground" aria-label="Breadcrumb">
				<a href="/projects" class="hover:text-foreground">{m.breadcrumb_home()}</a>
				<span>/</span>
				<a href={`/projects/${data.project.id}`} class="hover:text-foreground">{data.project.name}</a>
				<span>/</span>
				<a href={basePath} class="hover:text-foreground">{m.tc_title()}</a>
				<span>/</span>
				<span class="text-foreground font-medium">{tc.key}</span>
			</nav>
			<div class="mt-1 flex items-center gap-3">
				<h2 class="text-xl font-bold">{tc.key}</h2>
				{#if version}
					<PriorityBadge name={version.priority} color={getPriorityColor(version.priority)} />
				{/if}
			</div>
		</div>
		<div class="flex items-center gap-2">
			{#if lockHolder && !editing}
				<span class="flex items-center gap-1 text-xs text-orange-600">
					{m.lock_editing_by({ name: lockHolder.userName })}
					{#if canEdit}
						<Button variant="ghost" size="sm" class="h-5 px-1 text-xs" onclick={startEdit}>
							{m.lock_retry()}
						</Button>
					{/if}
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
				<Button variant="outline" size="sm" onclick={() => { saveAsTemplateOpen = true; }}>
					{m.template_save_as()}
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
												toast.error(m.error_delete_failed());
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

	<div class="grid gap-4 {showVersions ? 'lg:grid-cols-[1fr_300px]' : ''}">
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
						{@const filteredUnassigned = tagSearchInput
							? unassignedTags.filter((t) => t.name.toLowerCase().includes(tagSearchInput.toLowerCase()))
							: unassignedTags}
						{@const exactMatch = tagSearchInput && data.projectTags.some((t) => t.name.toLowerCase() === tagSearchInput.toLowerCase().trim())}
						{@const canCreateNew = tagSearchInput.trim().length > 0 && !exactMatch}

						<!-- Assign existing tag form (hidden) -->
						<form id="assignTagForm" method="POST" action="?/assignTag" use:formEnhance={() => {
							return async ({ result, update }) => {
								if (result.type === 'success') {
									toast.success(m.tag_assigned());
									tagSearchInput = '';
									showTagCreator = false;
									await update();
								}
							};
						}} class="hidden">
							<input type="hidden" name="tagId" value="" />
						</form>

						<!-- Create new tag form (hidden) -->
						<form id="createTagForm" method="POST" action="?/createTag" use:formEnhance={() => {
							return async ({ result, update }) => {
								if (result.type === 'success') {
									toast.success(m.tag_created());
									tagSearchInput = '';
									showTagCreator = false;
									newTagColor = TAG_PALETTE[0];
									await update();
								}
							};
						}} class="hidden">
							<input type="hidden" name="name" value="" />
							<input type="hidden" name="color" value="" />
						</form>

						<Popover.Root bind:open={showTagCreator} onOpenChange={(open) => { if (!open) tagSearchInput = ''; }}>
							<Popover.Trigger>
								{#snippet child({ props })}
									<Button variant="outline" size="sm" class="h-7 px-2 text-xs" {...props}>
										+ {m.tag_assign()}
									</Button>
								{/snippet}
							</Popover.Trigger>
							<Popover.Content class="w-56 p-2" align="start">
								<Input
									placeholder={m.tag_new_inline()}
									class="h-7 text-xs mb-2"
									bind:value={tagSearchInput}
									autofocus
								/>
								<div class="max-h-40 overflow-y-auto space-y-0.5">
									{#each filteredUnassigned as t (t.id)}
										<button
											type="button"
											class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-muted cursor-pointer"
											onclick={() => {
												const form = document.getElementById('assignTagForm') as HTMLFormElement;
												const hidden = form.querySelector<HTMLInputElement>('input[name="tagId"]');
												if (hidden) hidden.value = String(t.id);
												form.requestSubmit();
											}}
										>
											<span class="h-2 w-2 rounded-full shrink-0" style="background-color: {t.color}"></span>
											{t.name}
										</button>
									{/each}
								</div>
								{#if canCreateNew}
									<div class="border-t mt-1 pt-1">
										<div class="flex items-center gap-1 mb-1.5">
											{#each TAG_PALETTE as color (color)}
												<button
													type="button"
													class="h-4 w-4 rounded-full border {newTagColor === color ? 'border-foreground scale-110' : 'border-transparent'}"
													style="background-color: {color}"
													onclick={() => (newTagColor = color)}
												></button>
											{/each}
										</div>
										<button
											type="button"
											class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-muted cursor-pointer font-medium"
											onclick={() => {
												const form = document.getElementById('createTagForm') as HTMLFormElement;
												const nameInput = form.querySelector<HTMLInputElement>('input[name="name"]');
												const colorInput = form.querySelector<HTMLInputElement>('input[name="color"]');
												if (nameInput) nameInput.value = tagSearchInput.trim();
												if (colorInput) colorInput.value = newTagColor;
												form.requestSubmit();
											}}
										>
											<span class="h-2 w-2 rounded-full shrink-0" style="background-color: {newTagColor}"></span>
											{m.tag_create_inline({ name: tagSearchInput.trim() })}
										</button>
									</div>
								{/if}
								{#if filteredUnassigned.length === 0 && !canCreateNew}
									<p class="text-xs text-muted-foreground text-center py-2">{m.common_no_results()}</p>
								{/if}
							</Popover.Content>
						</Popover.Root>
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
						<form method="POST" action="?/update" use:enhance class="space-y-4">
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
										{$form.priority}
									</Select.Trigger>
									<Select.Content>
										{#each data.projectPriorities as p (p.id)}
											<Select.Item value={p.name} label={p.name}>
												<PriorityBadge name={p.name} color={p.color} />
											</Select.Item>
										{/each}
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

							<div class="space-y-2">
								<Label for="automationKey">{m.tc_automation_key_label()}</Label>
								<Input
									id="automationKey"
									name="automationKey"
									bind:value={$form.automationKey}
									placeholder={m.tc_automation_key_placeholder()}
								/>
								{#if $errors.automationKey}
									<p class="text-destructive text-sm">{$errors.automationKey}</p>
								{/if}
							</div>

							{#if customFieldDefs.length > 0}
								<div class="space-y-3 border-t pt-4">
									<h4 class="text-sm font-medium">{m.custom_field_title()}</h4>
									{#each customFieldDefs as cf (cf.id)}
										{@const fieldKey = String(cf.id)}
										<div class="space-y-1">
											<Label for="cf-{cf.id}">
												{cf.name}
												{#if cf.required}<span class="text-destructive">*</span>{/if}
											</Label>
											{#if cf.fieldType === 'TEXT'}
												<Input
													id="cf-{cf.id}"
													value={(getCustomFieldValue(fieldKey) as string) ?? ''}
													oninput={(e) => {
														setCustomFieldValue(fieldKey, e.currentTarget.value);
													}}
												/>
											{:else if cf.fieldType === 'NUMBER'}
												<Input
													id="cf-{cf.id}"
													type="number"
													value={(getCustomFieldValue(fieldKey) as string) ?? ''}
													oninput={(e) => {
														const v = e.currentTarget.value;
														setCustomFieldValue(fieldKey, v === '' ? null : Number(v));
													}}
												/>
											{:else if cf.fieldType === 'DATE'}
												<Input
													id="cf-{cf.id}"
													type="date"
													value={(getCustomFieldValue(fieldKey) as string) ?? ''}
													oninput={(e) => {
														setCustomFieldValue(fieldKey, e.currentTarget.value || null);
													}}
												/>
											{:else if cf.fieldType === 'URL'}
												<Input
													id="cf-{cf.id}"
													type="url"
													value={(getCustomFieldValue(fieldKey) as string) ?? ''}
													placeholder="https://..."
													oninput={(e) => {
														setCustomFieldValue(fieldKey, e.currentTarget.value || null);
													}}
												/>
											{:else if cf.fieldType === 'CHECKBOX'}
												<div class="flex items-center gap-2">
													<Checkbox
														id="cf-{cf.id}"
														checked={!!getCustomFieldValue(fieldKey)}
														onCheckedChange={(checked) => {
															setCustomFieldValue(fieldKey, !!checked);
														}}
													/>
												</div>
											{:else if cf.fieldType === 'SELECT'}
												<Select.Root
													type="single"
													value={(getCustomFieldValue(fieldKey) as string) ?? ''}
													onValueChange={(v) => {
														setCustomFieldValue(fieldKey, v || null);
													}}
												>
													<Select.Trigger class="w-full">
														{(getCustomFieldValue(fieldKey) as string) || '-'}
													</Select.Trigger>
													<Select.Content>
														{#each cf.options ?? [] as opt (opt)}
															<Select.Item value={opt} label={opt} />
														{/each}
													</Select.Content>
												</Select.Root>
											{:else if cf.fieldType === 'MULTISELECT'}
												{@const selected = ((getCustomFieldValue(fieldKey) ?? []) as string[])}
												<div class="flex flex-wrap gap-2">
													{#each cf.options ?? [] as opt (opt)}
														<label class="inline-flex items-center gap-1.5 text-sm cursor-pointer">
															<Checkbox
																checked={selected.includes(opt)}
																onCheckedChange={(checked) => {
																	const cur = ((getCustomFieldValue(fieldKey) ?? []) as string[]);
																	if (checked) {
																		setCustomFieldValue(fieldKey, [...cur, opt]);
																	} else {
																		setCustomFieldValue(fieldKey, cur.filter((v) => v !== opt));
																	}
																}}
															/>
															{opt}
														</label>
													{/each}
												</div>
											{/if}
										</div>
									{/each}
								</div>
							{/if}

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
					<Card.Content class="space-y-4">
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

						{#if tc.automationKey}
							<div>
								<h4 class="text-sm font-medium">{m.tc_automation_key_label()}</h4>
								<p class="text-muted-foreground mt-1 font-mono text-sm">
									{tc.automationKey}
								</p>
							</div>
						{/if}

						{#if customFieldDefs.length > 0}
							{@const hasAnyValue = customFieldDefs.some((cf) => {
								const v = customFieldValues[String(cf.id)];
								return v != null && v !== '' && !(Array.isArray(v) && v.length === 0);
							})}
							{#if hasAnyValue}
								<div class="border-t pt-4 space-y-3">
									<h4 class="text-sm font-medium">{m.custom_field_title()}</h4>
									{#each customFieldDefs as cf (cf.id)}
										{@const val = customFieldValues[String(cf.id)]}
										{#if val != null && val !== '' && !(Array.isArray(val) && val.length === 0)}
											<div>
												<span class="text-muted-foreground text-xs">{cf.name}</span>
												{#if cf.fieldType === 'URL' && typeof val === 'string'}
													<p class="text-sm mt-0.5">
														<a href={val} target="_blank" rel="noopener noreferrer" class="text-primary underline">{val}</a>
													</p>
												{:else if cf.fieldType === 'CHECKBOX'}
													<p class="text-sm mt-0.5">{val ? 'Yes' : 'No'}</p>
												{:else if cf.fieldType === 'MULTISELECT' && Array.isArray(val)}
													<div class="flex flex-wrap gap-1 mt-0.5">
														{#each val as v (v)}
															<Badge variant="secondary" class="text-xs">{v}</Badge>
														{/each}
													</div>
												{:else}
													<p class="text-muted-foreground mt-0.5 text-sm">{String(val)}</p>
												{/if}
											</div>
										{/if}
									{/each}
								</div>
							{/if}
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

			<!-- Parameters & Data -->
			<ParameterDataSection
				projectId={data.project.id}
				testCaseId={tc.id}
				parameters={data.parameters}
				dataSets={data.dataSets}
				editable={canEdit}
			/>

			<!-- Issue Links -->
			<Card.Root>
				<Card.Header>
					<div class="flex items-center justify-between">
						<Card.Title class="text-base">{m.issue_link_title()}</Card.Title>
						{#if canEdit}
							<div class="flex gap-2">
								{#if data.hasIssueTracker && issueLinks.length > 0}
									<Button
										variant="outline"
										size="sm"
										disabled={syncingAll}
										onclick={handleSyncAllIssueLinks}
									>
										{syncingAll ? m.common_loading() : m.issue_link_sync_all()}
									</Button>
								{/if}
								{#if data.hasIssueTracker}
									<Button
										variant="outline"
										size="sm"
										disabled={creatingIssue}
										onclick={handleCreateIssue}
									>
										{creatingIssue ? m.common_loading() : m.issue_link_create()}
									</Button>
								{/if}
								<Button
									variant="outline"
									size="sm"
									onclick={() => (showLinkForm = !showLinkForm)}
								>
									{m.issue_link_add()}
								</Button>
							</div>
						{/if}
					</div>
				</Card.Header>
				<Card.Content>
					{#if showLinkForm}
						<form
							onsubmit={(e) => {
								e.preventDefault();
								handleLinkIssue();
							}}
							class="mb-4 flex gap-2"
						>
							<Input
								placeholder={m.issue_link_url_placeholder()}
								type="url"
								bind:value={newIssueUrl}
								required
								class="flex-1"
							/>
							<Button type="submit" size="sm" disabled={linkingIssue || !newIssueUrl.trim()}>
								{linkingIssue ? m.common_loading() : m.issue_link_add()}
							</Button>
							<Button
								type="button"
								variant="outline"
								size="sm"
								onclick={() => {
									showLinkForm = false;
									newIssueUrl = '';
								}}
							>
								{m.common_cancel()}
							</Button>
						</form>
					{/if}

					{#if issueLinks.length === 0}
						<p class="text-muted-foreground text-sm">{m.issue_link_empty()}</p>
					{:else}
						<div class="space-y-2">
							{#each issueLinks as link (link.id)}
								<div class="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
									<div class="min-w-0 flex-1">
										<div class="flex items-center gap-2">
											{#if link.externalKey}
												<span class="text-xs font-mono font-medium">{link.externalKey}</span>
											{/if}
											{#if link.status}
												<span class="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium {issueStatusClass(link.status)}">
													{link.status}
												</span>
											{/if}
										</div>
										<a
											href={link.externalUrl}
											target="_blank"
											rel="noopener noreferrer"
											class="text-primary text-sm hover:underline truncate block"
										>
											{link.title || link.externalUrl}
										</a>
									</div>
									<div class="flex items-center gap-1 shrink-0">
										{#if canEdit && link.provider !== 'CUSTOM' && data.hasIssueTracker}
											<Button
												variant="ghost"
												size="sm"
												class="h-7 px-2 text-xs"
												disabled={syncingLinkId === link.id}
												onclick={() => handleSyncIssueLink(link.id)}
											>
												{syncingLinkId === link.id ? m.common_loading() : m.issue_link_sync()}
											</Button>
										{/if}
										{#if canEdit}
											<Button
												variant="ghost"
												size="sm"
												class="text-destructive hover:text-destructive h-7 px-2 text-xs"
												onclick={() => (deleteIssueLinkId = link.id)}
											>
												{m.common_delete()}
											</Button>
										{/if}
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</Card.Content>
			</Card.Root>

			<!-- Delete issue link dialog -->
			<AlertDialog.Root
				open={!!deleteIssueLinkId}
				onOpenChange={(open) => {
					if (!open) deleteIssueLinkId = null;
				}}
			>
				<AlertDialog.Portal>
					<AlertDialog.Overlay />
					<AlertDialog.Content>
						<AlertDialog.Header>
							<AlertDialog.Title>{m.issue_link_remove_title()}</AlertDialog.Title>
							<AlertDialog.Description>
								{m.issue_link_remove_confirm()}
							</AlertDialog.Description>
						</AlertDialog.Header>
						<AlertDialog.Footer>
							<AlertDialog.Cancel>{m.common_cancel()}</AlertDialog.Cancel>
							<Button variant="destructive" onclick={handleRemoveIssueLink}>{m.common_delete()}</Button>
						</AlertDialog.Footer>
					</AlertDialog.Content>
				</AlertDialog.Portal>
			</AlertDialog.Root>

			<!-- Comments -->
			<CommentSection
				testCaseId={tc.id}
				projectId={data.project.id}
				currentUserId={data.currentUserId}
				userRole={data.userRole}
			/>
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
										<PriorityBadge name={v.priority} color={getPriorityColor(v.priority)} />
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

<SaveAsTemplateDialog
	bind:open={saveAsTemplateOpen}
	projectId={data.project.id}
	defaultName={version ? version.title + ' Template' : ''}
	precondition={version?.precondition ?? ''}
	steps={(version?.steps ?? []).map((s: { action: string; expected: string }) => ({ action: s.action, expected: s.expected }))}
	priority={version?.priority ?? 'MEDIUM'}
/>
