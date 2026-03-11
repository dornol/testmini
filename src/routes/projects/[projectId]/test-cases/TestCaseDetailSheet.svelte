<script lang="ts">
	import * as Sheet from '$lib/components/ui/sheet/index.js';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import TagBadge from '$lib/components/TagBadge.svelte';
	import PriorityBadge from '$lib/components/PriorityBadge.svelte';
	import StepsEditor from '$lib/components/StepsEditor.svelte';
	import VersionDiffDialog from './VersionDiffDialog.svelte';
	import * as m from '$lib/paraglide/messages.js';
	import { toast } from 'svelte-sonner';
	import { apiFetch, apiPut, apiDelete, apiPost } from '$lib/api-client';

	let { projectId, canEdit, canDelete, projectPriorities, onchange }: {
		projectId: number;
		canEdit: boolean;
		canDelete: boolean;
		projectPriorities: { id: number; name: string; color: string; position: number; isDefault: boolean }[];
		onchange: () => void;
	} = $props();

	let sheetOpen = $state(false);
	let selectedTcId: number | null = $state(null);
	interface TestCaseVersion {
		id: number;
		versionNo: number;
		title: string;
		priority: string;
		precondition?: string | null;
		expectedResult?: string | null;
		steps?: { order: number; action: string; expected: string }[] | null;
		revision?: number;
		updatedBy?: string;
		createdAt?: string;
	}

	let detailData: {
		testCase: { id: number; key: string; createdAt: string; latestVersion: TestCaseVersion | null };
		versions: TestCaseVersion[];
		assignedTags: { id: number; name: string; color: string }[];
		projectTags: { id: number; name: string; color: string }[];
		assignedAssignees: { userId: string; userName: string; userImage: string | null }[];
		projectMembers: { userId: string; userName: string; userImage: string | null }[];
	} | null = $state(null);
	let detailLoading = $state(false);
	let detailEditing = $state(false);
	let detailDeleteOpen = $state(false);
	let showVersions = $state(false);

	let compareSelectedVersions = $state<number[]>([]);
	let diffDialogOpen = $state(false);
	let diffV1: TestCaseVersion | null = $state(null);
	let diffV2: TestCaseVersion | null = $state(null);
	let diffLoading = $state(false);

	function toggleVersionSelect(versionNo: number) {
		if (compareSelectedVersions.includes(versionNo)) {
			compareSelectedVersions = compareSelectedVersions.filter((v) => v !== versionNo);
		} else if (compareSelectedVersions.length < 2) {
			compareSelectedVersions = [...compareSelectedVersions, versionNo];
		} else {
			compareSelectedVersions = [compareSelectedVersions[1], versionNo];
		}
	}

	async function compareVersions() {
		if (compareSelectedVersions.length !== 2 || !selectedTcId) return;
		diffLoading = true;
		const [a, b] = compareSelectedVersions.sort((x, y) => x - y);
		try {
			const data = await apiFetch<{ v1: TestCaseVersion; v2: TestCaseVersion }>(
				`/api/projects/${projectId}/test-cases/${selectedTcId}/versions?v1=${a}&v2=${b}`
			);
			diffV1 = data.v1;
			diffV2 = data.v2;
			diffDialogOpen = true;
		} catch {
			// error toast handled by apiFetch
		} finally {
			diffLoading = false;
		}
	}

	let editTitle = $state('');
	let editPriority = $state('MEDIUM');
	let editPrecondition = $state('');
	let editSteps: { action: string; expected: string }[] = $state([]);
	let editExpectedResult = $state('');
	let editRevision = $state(1);
	let editSaving = $state(false);

	let sheetLockHolder = $state<{ userName: string } | null>(null);
	let sheetHeartbeatInterval: ReturnType<typeof setInterval> | undefined;

	const TAG_PALETTE = [
		'#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6',
		'#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#6b7280'
	];
	let showTagCreator = $state(false);
	let tagSearchInput = $state('');
	let newTagColor = $state(TAG_PALETTE[0]);

	function getPriorityColor(name: string): string {
		return projectPriorities.find((p) => p.name === name)?.color ?? '#6b7280';
	}

	export async function open(tcId: number) {
		selectedTcId = tcId;
		detailLoading = true;
		detailEditing = false;
		showVersions = false;
		sheetLockHolder = null;
		compareSelectedVersions = [];
		sheetOpen = true;

		try {
			detailData = await apiFetch(`/api/projects/${projectId}/test-cases/${tcId}`);
			const lockData = await apiFetch<{ locked: boolean; holder?: { userName: string } }>(
				`/api/projects/${projectId}/test-cases/${tcId}/lock`,
				{ silent: true }
			);
			if (lockData.locked && lockData.holder) sheetLockHolder = lockData.holder;
		} catch {
			sheetOpen = false;
		} finally {
			detailLoading = false;
		}
	}

	async function refresh(tcId: number) {
		try {
			detailData = await apiFetch(`/api/projects/${projectId}/test-cases/${tcId}`);
		} catch {
			console.warn('Failed to refresh detail data');
		}
	}

	async function startDetailEdit() {
		if (!detailData?.testCase.latestVersion || !selectedTcId) return;

		const lockUrl = `/api/projects/${projectId}/test-cases/${selectedTcId}/lock`;
		const res = await fetch(lockUrl, { method: 'POST' });
		const result = await res.json();
		if (!res.ok) {
			toast.error(m.lock_conflict({ name: result.holder?.userName ?? '?' }));
			sheetLockHolder = result.holder;
			return;
		}
		sheetLockHolder = null;

		clearInterval(sheetHeartbeatInterval);
		sheetHeartbeatInterval = setInterval(() => {
			fetch(lockUrl, { method: 'PUT' }).catch(() => {});
		}, 60_000);

		const v = detailData.testCase.latestVersion;
		editTitle = v.title ?? '';
		editPriority = v.priority ?? 'MEDIUM';
		editPrecondition = v.precondition ?? '';
		editSteps = (v.steps ?? []).map((s: { action: string; expected: string }) => ({
			action: s.action,
			expected: s.expected
		}));
		editExpectedResult = v.expectedResult ?? '';
		editRevision = v.revision ?? 1;
		detailEditing = true;
	}

	function cancelDetailEdit() {
		detailEditing = false;
		releaseSheetLock();
	}

	function releaseSheetLock() {
		clearInterval(sheetHeartbeatInterval);
		if (selectedTcId) {
			fetch(`/api/projects/${projectId}/test-cases/${selectedTcId}/lock`, {
				method: 'DELETE'
			}).catch(() => {});
		}
		sheetLockHolder = null;
	}

	async function saveDetailEdit() {
		if (!selectedTcId) return;
		editSaving = true;

		try {
			await apiPut(`/api/projects/${projectId}/test-cases/${selectedTcId}`, {
				title: editTitle,
				precondition: editPrecondition,
				steps: editSteps,
				expectedResult: editExpectedResult,
				priority: editPriority,
				revision: editRevision
			});
			toast.success('Test case updated');
			detailEditing = false;
			releaseSheetLock();
			await refresh(selectedTcId);
			onchange();
		} catch {
			// error toast handled by apiPut
		} finally {
			editSaving = false;
		}
	}

	async function deleteFromSheet() {
		if (!selectedTcId) return;
		try {
			await apiDelete(`/api/projects/${projectId}/test-cases/${selectedTcId}`);
			toast.success(m.tc_deleted());
			sheetOpen = false;
			detailData = null;
			selectedTcId = null;
			detailDeleteOpen = false;
			onchange();
		} catch {
			// error toast handled by apiDelete
		}
	}

	async function assignTag(tagId: number) {
		if (!selectedTcId) return;
		try {
			await apiPost(`/api/projects/${projectId}/test-cases/bulk`, {
				action: 'addTag',
				testCaseIds: [selectedTcId],
				tagId
			});
			toast.success(m.tag_assigned());
			await refresh(selectedTcId);
			onchange();
		} catch {
			toast.error(m.error_operation_failed());
		}
	}

	async function removeTag(tagId: number) {
		if (!selectedTcId) return;
		try {
			await apiPost(`/api/projects/${projectId}/test-cases/bulk`, {
				action: 'removeTag',
				testCaseIds: [selectedTcId],
				tagId
			});
			toast.success(m.tag_removed());
			await refresh(selectedTcId);
			onchange();
		} catch {
			toast.error(m.error_remove_failed());
		}
	}

	async function createAndAssignTag(name: string, color: string) {
		if (!selectedTcId) return;
		try {
			await apiPost(`/api/projects/${projectId}/tags`, {
				name: name.trim(),
				color,
				testCaseId: selectedTcId
			});
			toast.success(m.tag_created());
			tagSearchInput = '';
			showTagCreator = false;
			newTagColor = TAG_PALETTE[0];
			await refresh(selectedTcId);
			onchange();
		} catch {
			toast.error(m.error_operation_failed());
		}
	}

	async function assignAssignee(userId: string) {
		if (!selectedTcId) return;
		try {
			await apiPost(`/api/projects/${projectId}/test-cases/bulk`, {
				action: 'addAssignee',
				testCaseIds: [selectedTcId],
				userId
			});
			toast.success(m.assignee_assigned());
			await refresh(selectedTcId);
			onchange();
		} catch {
			toast.error(m.error_operation_failed());
		}
	}

	async function removeAssignee(userId: string) {
		if (!selectedTcId) return;
		try {
			await apiPost(`/api/projects/${projectId}/test-cases/bulk`, {
				action: 'removeAssignee',
				testCaseIds: [selectedTcId],
				userId
			});
			toast.success(m.assignee_removed());
			await refresh(selectedTcId);
			onchange();
		} catch {
			toast.error(m.error_remove_failed());
		}
	}

	async function cloneFromSheet() {
		if (!selectedTcId) return;
		try {
			const result = await apiPost<{ newTestCaseId: number }>(
				`/api/projects/${projectId}/test-cases/${selectedTcId}/clone`,
				{}
			);
			toast.success(m.tc_cloned());
			selectedTcId = result.newTestCaseId;
			await refresh(result.newTestCaseId);
			onchange();
		} catch {
			// error toast handled by apiPost
		}
	}

	function handleSheetClose(isOpen: boolean) {
		if (!isOpen) {
			if (detailEditing) releaseSheetLock();
			detailEditing = false;
			detailData = null;
			selectedTcId = null;
		}
	}
</script>

<Sheet.Root bind:open={sheetOpen} onOpenChange={handleSheetClose}>
	<Sheet.Content side="right" class="sm:max-w-2xl w-full overflow-y-auto p-0 data-[state=open]:duration-300 data-[state=closed]:duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-end data-[state=closed]:slide-out-to-end">
		{#if detailLoading}
			<div class="p-6 space-y-6">
				<div class="space-y-2">
					<div class="h-5 w-24 bg-muted animate-pulse rounded"></div>
					<div class="h-4 w-48 bg-muted animate-pulse rounded"></div>
				</div>
				<div class="h-8 w-full bg-muted animate-pulse rounded"></div>
				<div class="space-y-2">
					<div class="h-4 w-32 bg-muted animate-pulse rounded"></div>
					<div class="h-20 w-full bg-muted animate-pulse rounded"></div>
				</div>
				<div class="space-y-2">
					<div class="h-4 w-32 bg-muted animate-pulse rounded"></div>
					<div class="h-20 w-full bg-muted animate-pulse rounded"></div>
				</div>
			</div>
		{:else if detailData}
			{@const tc = detailData.testCase}
			{@const version = tc.latestVersion}

			<!-- Header area -->
			<div class="border-b bg-muted/30 px-6 pt-6 pb-4">
				<div class="flex items-start justify-between gap-4 pr-8">
					<div class="space-y-1.5">
						<div class="flex items-center gap-2.5">
							<span class="bg-muted font-mono text-xs font-semibold px-2 py-0.5 rounded">{tc.key}</span>
							{#if version}
								<PriorityBadge name={version.priority} color={getPriorityColor(version.priority)} />
							{/if}
							<span class="text-muted-foreground text-xs">v{version?.versionNo ?? 0}</span>
						</div>
						<h3 class="text-lg font-semibold leading-tight">{version?.title ?? ''}</h3>
						<p class="text-muted-foreground text-xs">
							Created {new Date(tc.createdAt).toLocaleDateString()}
						</p>
					</div>
				</div>

				{#if sheetLockHolder && !detailEditing}
					<div class="mt-3 text-xs text-orange-600">
						{m.lock_editing_by({ name: sheetLockHolder.userName })}
					</div>
				{/if}
				<div class="flex items-center gap-2 mt-4">
					{#if canEdit && !detailEditing}
						<Button size="sm" class="h-7 text-xs" onclick={startDetailEdit}>
							<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-1"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
							{m.common_edit()}
						</Button>
					{/if}
					{#if canEdit && !detailEditing}
						<Button variant="outline" size="sm" class="h-7 text-xs" onclick={cloneFromSheet}>
							<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-1"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
							{m.tc_clone()}
						</Button>
					{/if}
					<Button variant="outline" size="sm" class="h-7 text-xs" onclick={() => (showVersions = !showVersions)}>
						<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-1"><path d="M12 8v4l3 3"/><circle cx="12" cy="12" r="10"/></svg>
						{showVersions ? m.tc_detail_hide_history() : m.tc_detail_version_history()}
					</Button>
					{#if canDelete && !detailEditing}
						<AlertDialog.Root bind:open={detailDeleteOpen}>
							<AlertDialog.Trigger>
								{#snippet child({ props })}
									<Button variant="ghost" size="sm" class="h-7 text-xs text-destructive hover:text-destructive" {...props}>
										<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-1"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
										{m.common_delete()}
									</Button>
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
										<Button variant="destructive" onclick={deleteFromSheet}>{m.common_delete()}</Button>
									</AlertDialog.Footer>
								</AlertDialog.Content>
							</AlertDialog.Portal>
						</AlertDialog.Root>
					{/if}
				</div>
			</div>

			<!-- Content area -->
			<div class="px-6 py-5 space-y-5">
				<!-- Tags section -->
				{#if !detailEditing && (detailData.assignedTags.length > 0 || canEdit)}
					<div class="flex flex-wrap items-center gap-1.5">
						{#each detailData.assignedTags as t (t.id)}
							{#if canEdit}
								<span class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium hover:bg-muted/50 transition-colors">
									<span class="h-2 w-2 rounded-full shrink-0" style="background-color: {t.color}"></span>
									{t.name}
									<button type="button" class="text-muted-foreground hover:text-destructive ml-0.5 transition-colors" aria-label="Remove" onclick={() => removeTag(t.id)}>&times;</button>
								</span>
							{:else}
								<TagBadge name={t.name} color={t.color} />
							{/if}
						{/each}
						{#if canEdit}
							{@const unassignedTags = detailData.projectTags.filter(
								(pt) => !detailData!.assignedTags.some((at) => at.id === pt.id)
							)}
							{@const filteredUnassigned = tagSearchInput
								? unassignedTags.filter((t) => t.name.toLowerCase().includes(tagSearchInput.toLowerCase()))
								: unassignedTags}
							{@const exactMatch = tagSearchInput && detailData.projectTags.some((t) => t.name.toLowerCase() === tagSearchInput.toLowerCase().trim())}
							{@const canCreateNew = tagSearchInput.trim().length > 0 && !exactMatch}
							<Popover.Root bind:open={showTagCreator} onOpenChange={(open) => { if (!open) tagSearchInput = ''; }}>
								<Popover.Trigger>
									{#snippet child({ props })}
										<button type="button" class="border-input bg-background h-6 rounded-md border px-2 text-xs hover:bg-muted/50 transition-colors cursor-pointer" {...props}>
											+ {m.tag_assign()}
										</button>
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
												onclick={() => { assignTag(t.id); tagSearchInput = ''; showTagCreator = false; }}
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
														aria-label="Select color {color}"
														onclick={() => (newTagColor = color)}
													></button>
												{/each}
											</div>
											<button
												type="button"
												class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-muted cursor-pointer font-medium"
												onclick={() => createAndAssignTag(tagSearchInput, newTagColor)}
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
				{/if}

				<!-- Assignees section -->
				{#if !detailEditing && detailData.assignedAssignees}
					<div class="flex flex-wrap items-center gap-1.5">
						<span class="text-xs font-medium text-muted-foreground mr-1">{m.assignee_title()}:</span>
						{#each detailData.assignedAssignees as a (a.userId)}
							{#if canEdit}
								<span class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium hover:bg-muted/50 transition-colors">
									{a.userName}
									<button type="button" class="text-muted-foreground hover:text-destructive ml-0.5 transition-colors" aria-label="Remove" onclick={() => removeAssignee(a.userId)}>&times;</button>
								</span>
							{:else}
								<Badge variant="outline" class="text-xs">{a.userName}</Badge>
							{/if}
						{/each}
						{#if canEdit && detailData.projectMembers}
							{@const unassignedMembers = detailData.projectMembers.filter(
								(pm) => !detailData!.assignedAssignees.some((a) => a.userId === pm.userId)
							)}
							{#if unassignedMembers.length > 0}
								<DropdownMenu.Root>
									<DropdownMenu.Trigger>
										{#snippet child({ props })}
											<button type="button" class="border-input bg-background h-6 rounded-md border px-2 text-xs hover:bg-muted/50 transition-colors cursor-pointer" {...props}>
												+ {m.assignee_assign()}
											</button>
										{/snippet}
									</DropdownMenu.Trigger>
									<DropdownMenu.Content align="start" class="min-w-[140px]">
										{#each unassignedMembers as member (member.userId)}
											<DropdownMenu.Item onclick={() => assignAssignee(member.userId)} class="text-xs">
												{member.userName}
											</DropdownMenu.Item>
										{/each}
									</DropdownMenu.Content>
								</DropdownMenu.Root>
							{/if}
						{/if}
					</div>
				{/if}

				{#if detailEditing}
					<!-- Edit Mode -->
					<div class="space-y-5">
						<div class="space-y-1.5">
							<Label for="detail-title" class="text-xs font-medium text-muted-foreground">{m.tc_title_label()}</Label>
							<Input id="detail-title" bind:value={editTitle} class="h-9" />
						</div>

						<div class="space-y-1.5">
							<Label class="text-xs font-medium text-muted-foreground">{m.common_priority()}</Label>
							<DropdownMenu.Root>
								<DropdownMenu.Trigger>
									{#snippet child({ props })}
										<Button variant="outline" class="h-9 w-full justify-between text-sm font-normal" {...props}>
											<span class="flex items-center gap-2">
												<PriorityBadge name={editPriority} color={getPriorityColor(editPriority)} />
											</span>
											<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground"><polyline points="6 9 12 15 18 9"/></svg>
										</Button>
									{/snippet}
								</DropdownMenu.Trigger>
								<DropdownMenu.Content class="min-w-[160px]">
									{#each projectPriorities as p (p.id)}
										<DropdownMenu.Item onclick={() => { editPriority = p.name; }} class="text-sm">
											<PriorityBadge name={p.name} color={p.color} />
										</DropdownMenu.Item>
									{/each}
								</DropdownMenu.Content>
							</DropdownMenu.Root>
						</div>

						<div class="space-y-1.5">
							<Label for="detail-precondition" class="text-xs font-medium text-muted-foreground">{m.tc_precondition()}</Label>
							<Textarea id="detail-precondition" bind:value={editPrecondition} rows={3} class="text-sm" />
						</div>

						<StepsEditor
							value={editSteps}
							onchange={(s) => { editSteps = s; }}
						/>

						<div class="space-y-1.5">
							<Label for="detail-expected" class="text-xs font-medium text-muted-foreground">{m.tc_expected_result()}</Label>
							<Textarea id="detail-expected" bind:value={editExpectedResult} rows={3} class="text-sm" />
						</div>

						<div class="flex gap-2 pt-2 border-t">
							<Button size="sm" onclick={saveDetailEdit} disabled={editSaving}>
								{editSaving ? m.common_saving() : m.common_save_changes()}
							</Button>
							<Button variant="outline" size="sm" onclick={cancelDetailEdit}>{m.common_cancel()}</Button>
						</div>
					</div>
				{:else if version}
					<!-- View Mode -->
					<div class="space-y-5">
						{#if version.precondition}
							<div class="space-y-1.5">
								<div class="flex items-center gap-1.5">
									<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/></svg>
									<h4 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{m.tc_precondition()}</h4>
								</div>
								<div class="bg-muted/40 rounded-lg p-3">
									<p class="whitespace-pre-wrap text-sm leading-relaxed">{version.precondition}</p>
								</div>
							</div>
						{/if}

						{#if version.steps && version.steps.length > 0}
							<div class="space-y-2">
								<div class="flex items-center gap-1.5">
									<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/></svg>
									<h4 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{m.tc_detail_steps()}</h4>
								</div>
								<div class="space-y-2">
									{#each version.steps as step (step.order)}
										<div class="rounded-lg border p-3 hover:bg-muted/20 transition-colors">
											<div class="flex items-center gap-2 mb-1.5">
												<span class="bg-primary/10 text-primary text-[10px] font-bold rounded-full h-5 w-5 flex items-center justify-center shrink-0">{step.order}</span>
												<span class="text-xs font-medium text-muted-foreground">{m.tc_detail_action()}</span>
											</div>
											<p class="text-sm pl-7">{step.action}</p>
											{#if step.expected}
												<div class="mt-2 pl-7 border-l-2 border-muted ml-2.5">
													<span class="text-xs text-muted-foreground">{m.tc_detail_expected()}</span>
													<p class="text-sm">{step.expected}</p>
												</div>
											{/if}
										</div>
									{/each}
								</div>
							</div>
						{/if}

						{#if version.expectedResult}
							<div class="space-y-1.5">
								<div class="flex items-center gap-1.5">
									<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
									<h4 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{m.tc_expected_result()}</h4>
								</div>
								<div class="bg-green-50 dark:bg-green-950/20 rounded-lg p-3 border border-green-200/50 dark:border-green-800/30">
									<p class="whitespace-pre-wrap text-sm leading-relaxed">{version.expectedResult}</p>
								</div>
							</div>
						{/if}

						{#if !version.precondition && (!version.steps || version.steps.length === 0) && !version.expectedResult}
							<div class="text-center py-8">
								<p class="text-muted-foreground text-sm">{m.common_no_results()}</p>
								{#if canEdit}
									<Button variant="outline" size="sm" class="mt-3" onclick={startDetailEdit}>{m.common_edit()}</Button>
								{/if}
							</div>
						{/if}
					</div>
				{/if}

				<!-- Version History (collapsible) -->
				{#if showVersions}
					<div class="border-t pt-4">
						<div class="flex items-center justify-between mb-3">
							<div class="flex items-center gap-1.5">
								<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground"><path d="M12 8v4l3 3"/><circle cx="12" cy="12" r="10"/></svg>
								<h4 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{m.tc_detail_version_history()}</h4>
							</div>
							{#if detailData.versions.length >= 2}
								<div class="flex items-center gap-2">
									{#if compareSelectedVersions.length < 2}
										<span class="text-[10px] text-muted-foreground">{m.tc_version_select_hint()}</span>
									{/if}
									<Button size="sm" class="h-6 text-[10px] px-2" disabled={compareSelectedVersions.length !== 2 || diffLoading} onclick={compareVersions}>
										{diffLoading ? m.common_saving() : m.tc_version_compare_btn()}
									</Button>
								</div>
							{/if}
						</div>
						{#if detailData.versions.length === 0}
							<p class="text-muted-foreground text-sm">{m.tc_detail_no_versions()}</p>
						{:else}
							<div class="space-y-1.5">
								{#each detailData.versions as v (v.id)}
									{@const isSelected = compareSelectedVersions.includes(v.versionNo)}
									<button
										type="button"
										class="w-full text-left rounded-lg border p-3 transition-colors cursor-pointer {isSelected ? 'border-blue-400 bg-blue-50 dark:bg-blue-950/30' : v.id === version?.id ? 'border-primary/50 bg-primary/5' : 'hover:bg-muted/30'}"
										onclick={() => toggleVersionSelect(v.versionNo)}
									>
										<div class="flex items-center justify-between">
											<div class="flex items-center gap-2">
												{#if detailData.versions.length >= 2}
													<input type="checkbox" checked={isSelected} class="h-3 w-3 rounded border-gray-300" onclick={(e) => e.stopPropagation()} onchange={() => toggleVersionSelect(v.versionNo)} />
												{/if}
												<span class="text-xs font-semibold {v.id === version?.id ? 'text-primary' : ''}">v{v.versionNo}</span>
												{#if v.id === version?.id}
													<span class="text-[10px] bg-primary/10 text-primary rounded px-1.5 py-0.5">latest</span>
												{/if}
											</div>
											<PriorityBadge name={v.priority} color={getPriorityColor(v.priority)} />
										</div>
										<p class="mt-1 text-sm truncate">{v.title}</p>
										<div class="text-muted-foreground mt-1 text-xs">
											{v.updatedBy} &middot; {v.createdAt ? new Date(v.createdAt).toLocaleDateString() : ''}
										</div>
									</button>
								{/each}
							</div>
						{/if}
					</div>
				{/if}
			</div>
		{/if}
	</Sheet.Content>
</Sheet.Root>

<VersionDiffDialog bind:open={diffDialogOpen} v1={diffV1} v2={diffV2} {projectPriorities} />
