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
	import DetailSheetStepsTab from './DetailSheetStepsTab.svelte';
	import DetailSheetCommentsTab from './DetailSheetCommentsTab.svelte';
	import DetailSheetCustomFieldsTab from './DetailSheetCustomFieldsTab.svelte';
	import VersionDiffDialog from './VersionDiffDialog.svelte';
	import * as m from '$lib/paraglide/messages.js';
	import { toast } from 'svelte-sonner';
	import { apiFetch, apiPut, apiDelete, apiPost } from '$lib/api-client';
	import { TAG_PALETTE } from '$lib/constants';

	let { projectId, canEdit, canDelete, projectPriorities, customFieldDefs, currentUserId, userRole, hasIssueTracker, onchange }: {
		projectId: number;
		canEdit: boolean;
		canDelete: boolean;
		projectPriorities: { id: number; name: string; color: string; position: number; isDefault: boolean }[];
		customFieldDefs: { id: number; name: string; fieldType: string; options: string[] | null }[];
		currentUserId: string;
		userRole: string;
		hasIssueTracker: boolean;
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
		stepFormat?: string | null;
		steps?: { order: number; action: string; expected: string }[] | null;
		revision?: number;
		updatedBy?: string;
		createdAt?: string;
		customFields?: Record<string, unknown> | null;
	}

	let detailData: {
		testCase: {
			id: number;
			key: string;
			automationKey?: string | null;
			approvalStatus?: string;
			createdAt: string;
			latestVersion: TestCaseVersion | null;
		};
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

	// Active tab for content sections
	let contentTab = $state<'steps' | 'comments' | 'issues' | 'customFields'>('steps');

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

	let showTagCreator = $state(false);
	let tagSearchInput = $state('');
	let newTagColor = $state(TAG_PALETTE[0]);

	// Resizable sheet
	let sheetWidth = $state(720);
	let isResizing = $state(false);

	function startResize(e: MouseEvent) {
		e.preventDefault();
		isResizing = true;
		const startX = e.clientX;
		const startWidth = sheetWidth;
		function onMouseMove(ev: MouseEvent) {
			const delta = startX - ev.clientX;
			sheetWidth = Math.max(480, Math.min(startWidth + delta, window.innerWidth * 0.85));
		}
		function onMouseUp() {
			isResizing = false;
			window.removeEventListener('mousemove', onMouseMove);
			window.removeEventListener('mouseup', onMouseUp);
		}
		window.addEventListener('mousemove', onMouseMove);
		window.addEventListener('mouseup', onMouseUp);
	}

	function getPriorityColor(name: string): string {
		return projectPriorities.find((p) => p.name === name)?.color ?? '#6b7280';
	}

	function getApprovalBadgeClass(status: string): string {
		switch (status) {
			case 'IN_REVIEW': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
			case 'APPROVED': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
			case 'REJECTED': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
			default: return 'bg-muted text-muted-foreground';
		}
	}

	export async function open(tcId: number) {
		selectedTcId = tcId;
		detailLoading = true;
		detailEditing = false;
		showVersions = false;
		sheetLockHolder = null;
		compareSelectedVersions = [];
		contentTab = 'steps';
		sheetOpen = true;
		checkCooldown(tcId);

		try {
			detailData = await apiFetch(`/api/projects/${projectId}/test-cases/${tcId}`);
			const [lockData] = await Promise.all([
				apiFetch<{ locked: boolean; holder?: { userName: string } }>(
					`/api/projects/${projectId}/test-cases/${tcId}/lock`,
					{ silent: true }
				),
				hasIssueTracker ? loadIssueLinks(tcId) : Promise.resolve()
			]);
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
			toast.error('Failed to refresh detail data');
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

	// Issue links
	interface IssueLinkRecord {
		id: number;
		externalUrl: string;
		externalKey: string | null;
		title: string | null;
		status: string | null;
		provider: string;
	}
	interface IssueComment {
		id: number;
		body: string;
		author: string;
		authorAvatar?: string;
		createdAt: string;
	}
	interface IssueDetailData {
		title: string;
		body: string;
		state: string;
		stateCategory: string;
		author: string;
		authorAvatar?: string;
		labels: { name: string; color: string }[];
		createdAt: string;
		updatedAt: string;
		closedAt: string | null;
		comments: IssueComment[];
	}

	let issueLinks = $state<IssueLinkRecord[]>([]);
	let creatingIssue = $state(false);
	const issueCooldownMap = new Map<number, number>(); // tcId -> expiry timestamp
	let issueCreateCooldown = $state(0);
	let cooldownTimer: ReturnType<typeof setInterval> | undefined;

	function startCooldown() {
		if (!selectedTcId) return;
		const expiry = Date.now() + 60_000;
		issueCooldownMap.set(selectedTcId, expiry);
		resumeCooldownTimer(expiry);
	}

	function resumeCooldownTimer(expiry: number) {
		clearInterval(cooldownTimer);
		issueCreateCooldown = Math.ceil((expiry - Date.now()) / 1000);
		if (issueCreateCooldown <= 0) { issueCreateCooldown = 0; return; }
		cooldownTimer = setInterval(() => {
			issueCreateCooldown = Math.ceil((expiry - Date.now()) / 1000);
			if (issueCreateCooldown <= 0) {
				issueCreateCooldown = 0;
				clearInterval(cooldownTimer);
				if (selectedTcId) issueCooldownMap.delete(selectedTcId);
			}
		}, 1000);
	}

	function checkCooldown(tcId: number) {
		const expiry = issueCooldownMap.get(tcId);
		if (expiry && expiry > Date.now()) {
			resumeCooldownTimer(expiry);
		} else {
			issueCreateCooldown = 0;
			clearInterval(cooldownTimer);
			if (expiry) issueCooldownMap.delete(tcId);
		}
	}
	let showLinkForm = $state(false);
	let newIssueUrl = $state('');
	let linkingIssue = $state(false);
	let syncingAll = $state(false);

	// Issue detail expansion
	let expandedLinkId = $state<number | null>(null);
	let issueDetail = $state<IssueDetailData | null>(null);
	let detailFetching = $state(false);

	// Issue actions
	let newComment = $state('');
	let postingComment = $state(false);
	let togglingState = $state(false);

	async function loadIssueLinks(tcId: number) {
		try {
			issueLinks = await apiFetch<IssueLinkRecord[]>(
				`/api/projects/${projectId}/issue-links?testCaseId=${tcId}`,
				{ silent: true }
			);
		} catch {
			issueLinks = [];
		}
	}

	async function handleCreateIssue() {
		if (creatingIssue || issueCreateCooldown > 0 || !selectedTcId || !detailData) return;
		creatingIssue = true;
		const version = detailData.testCase.latestVersion;
		try {
			const created = await apiPost<IssueLinkRecord>(
				`/api/projects/${projectId}/issue-links/create-issue`,
				{
					testCaseId: selectedTcId,
					title: `[${detailData.testCase.key}] ${version?.title ?? 'Test failure'}`,
					description: `Test case ${detailData.testCase.key}\n\nTitle: ${version?.title ?? ''}\nPriority: ${version?.priority ?? ''}`
				}
			);
			issueLinks = [created, ...issueLinks];
			toast.success(m.issue_link_created());
			startCooldown();
			onchange();
		} catch {
			// error toast handled by apiPost
		} finally {
			creatingIssue = false;
		}
	}

	async function handleLinkIssue() {
		if (linkingIssue || !newIssueUrl.trim() || !selectedTcId) return;
		linkingIssue = true;
		try {
			const created = await apiPost<IssueLinkRecord>(
				`/api/projects/${projectId}/issue-links`,
				{ testCaseId: selectedTcId, externalUrl: newIssueUrl.trim() }
			);
			issueLinks = [created, ...issueLinks];
			newIssueUrl = '';
			showLinkForm = false;
			toast.success(m.issue_link_linked());
			onchange();
		} catch {
			// handled
		} finally {
			linkingIssue = false;
		}
	}

	async function handleRemoveIssueLink(linkId: number) {
		try {
			await apiDelete(`/api/projects/${projectId}/issue-links/${linkId}`);
			issueLinks = issueLinks.filter((l) => l.id !== linkId);
			if (expandedLinkId === linkId) {
				expandedLinkId = null;
				issueDetail = null;
			}
			toast.success(m.issue_link_removed());
			onchange();
		} catch {
			// handled
		}
	}

	async function loadIssueDetail(linkId: number, silent = false) {
		if (!silent) {
			detailFetching = true;
			issueDetail = null;
		}
		try {
			const data = await apiFetch<IssueDetailData>(
				`/api/projects/${projectId}/issue-links/${linkId}/detail`
			);
			issueDetail = data;
			// Update local status from fetched detail
			const link = issueLinks.find((l) => l.id === linkId);
			if (link && data && link.status !== data.state) {
				link.status = data.state;
				issueLinks = issueLinks; // trigger reactivity
			}
		} catch {
			if (!silent) issueDetail = null;
		} finally {
			detailFetching = false;
		}
	}

	async function toggleIssueDetail(linkId: number) {
		if (expandedLinkId === linkId) {
			expandedLinkId = null;
			issueDetail = null;
			return;
		}
		expandedLinkId = linkId;
		await loadIssueDetail(linkId);
	}

	async function syncAllIssues() {
		if (syncingAll || !selectedTcId) return;
		syncingAll = true;
		try {
			const result = await apiPost<{ synced: number; failed: number }>(
				`/api/projects/${projectId}/issue-links/sync?testCaseId=${selectedTcId}`,
				{}
			);
			toast.success(`${result.synced} issue(s) synced`);
			await loadIssueLinks(selectedTcId);
			if (expandedLinkId) {
				await loadIssueDetail(expandedLinkId);
			}
			onchange();
		} catch {
			// handled
		} finally {
			syncingAll = false;
		}
	}

	async function postComment() {
		if (postingComment || !expandedLinkId || !newComment.trim()) return;
		postingComment = true;
		try {
			await apiPost(`/api/projects/${projectId}/issue-links/${expandedLinkId}/comment`, {
				comment: newComment.trim()
			});
			newComment = '';
			toast.success(m.comment_added());
			await loadIssueDetail(expandedLinkId, true);
		} catch {
			// handled by apiPost
		} finally {
			postingComment = false;
		}
	}

	async function toggleIssueState() {
		if (togglingState || !expandedLinkId || !issueDetail) return;
		const newState = issueDetail.state === 'closed' ? 'open' : 'closed';
		togglingState = true;
		try {
			await apiPost(`/api/projects/${projectId}/issue-links/${expandedLinkId}/state`, {
				state: newState
			});
			toast.success(newState === 'closed' ? 'Issue closed' : 'Issue reopened');
			await loadIssueDetail(expandedLinkId, true);
			// Update list status
			const link = issueLinks.find((l) => l.id === expandedLinkId);
			if (link) {
				link.status = newState;
				issueLinks = issueLinks;
			}
			onchange();
		} catch {
			// handled
		} finally {
			togglingState = false;
		}
	}

	function formatDate(dateStr: string): string {
		const d = new Date(dateStr);
		return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
	}

	function handleSheetClose(isOpen: boolean) {
		if (!isOpen) {
			if (detailEditing) releaseSheetLock();
			detailEditing = false;
			detailData = null;
			selectedTcId = null;
			issueLinks = [];
			showLinkForm = false;
			newIssueUrl = '';
			expandedLinkId = null;
			issueDetail = null;
			newComment = '';
			clearInterval(cooldownTimer);
		}
	}
</script>

<Sheet.Root bind:open={sheetOpen} onOpenChange={handleSheetClose}>
	<Sheet.Content side="right" class="!max-w-none overflow-y-auto p-0 data-[state=open]:duration-300 data-[state=closed]:duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-end data-[state=closed]:slide-out-to-end {isResizing ? 'select-none' : ''}" style="width: {sheetWidth}px !important">
		<!-- Resize handle -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-primary/20 active:bg-primary/30 transition-colors z-50"
			onmousedown={startResize}
		></div>
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
							{#if tc.approvalStatus}
								<span class="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium {getApprovalBadgeClass(tc.approvalStatus)}">
									{tc.approvalStatus}
								</span>
							{/if}
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
					<a href="/projects/{projectId}/test-cases/{tc.id}" class="inline-flex items-center justify-center whitespace-nowrap font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground rounded-md h-7 text-xs px-3">
						<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-1"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>
						{m.tc_detail_open_full_page()}
					</a>
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
				{#if !detailEditing}
					<div class="mt-3 space-y-1.5">
						<!-- Tags row -->
						<div class="flex items-center gap-1.5">
							<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground shrink-0"><path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/></svg>
							<div class="flex-1 min-w-0 overflow-x-auto detail-thin-scroll">
								<div class="flex items-center gap-1 w-max">
									{#each detailData.assignedTags as t (t.id)}
										{#if canEdit}
											<span class="inline-flex items-center gap-1 rounded-full border px-1.5 text-[11px] font-medium hover:bg-muted/50 transition-colors leading-5 whitespace-nowrap">
												<span class="h-1.5 w-1.5 rounded-full shrink-0" style="background-color: {t.color}"></span>
												{t.name}
												<button type="button" class="text-muted-foreground hover:text-destructive transition-colors" aria-label="Remove" onclick={() => removeTag(t.id)}>&times;</button>
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
													<button type="button" class="text-muted-foreground hover:text-foreground transition-colors cursor-pointer p-0.5 shrink-0" title={m.tag_assign()} {...props}>
														<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/><path d="M12 8v8"/></svg>
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
							</div>
						</div>
						<!-- Assignees row -->
						<div class="flex items-center gap-1.5">
							<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground shrink-0"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
							<div class="flex-1 min-w-0 overflow-x-auto detail-thin-scroll">
								<div class="flex items-center gap-1 w-max">
									{#each detailData.assignedAssignees as a (a.userId)}
										{#if canEdit}
											<span class="inline-flex items-center gap-1 rounded-full bg-muted/60 px-1.5 text-[11px] font-medium hover:bg-muted transition-colors leading-5 whitespace-nowrap">
												{a.userName}
												<button type="button" class="text-muted-foreground hover:text-destructive transition-colors" aria-label="Remove" onclick={() => removeAssignee(a.userId)}>&times;</button>
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
														<button type="button" class="text-muted-foreground hover:text-foreground transition-colors cursor-pointer p-0.5 shrink-0" title={m.assignee_assign()} {...props}>
															<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/><path d="M12 8v8"/></svg>
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
							</div>
						</div>
					</div>
				{/if}
			</div>

			<!-- Content area -->
			<div class="px-6 py-3 flex flex-col flex-1 min-h-0">
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
					<!-- Content Tabs -->
					<div class="border-b mb-4">
						<div class="flex">
							<button
								type="button"
								class="px-4 py-2 text-sm font-medium border-b-2 transition-colors {contentTab === 'steps' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}"
								onclick={() => (contentTab = 'steps')}
							>
								{m.tc_detail_steps()}
							</button>
							<button
								type="button"
								class="px-4 py-2 text-sm font-medium border-b-2 transition-colors {contentTab === 'comments' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}"
								onclick={() => (contentTab = 'comments')}
							>
								{m.comment_title()}
							</button>
							{#if hasIssueTracker}
								<button
									type="button"
									class="px-4 py-2 text-sm font-medium border-b-2 transition-colors {contentTab === 'issues' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}"
									onclick={() => (contentTab = 'issues')}
								>
									{m.issue_link_title()}
									{#if issueLinks.length > 0}
										<span class="ml-1 inline-flex items-center justify-center rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium leading-none">{issueLinks.length}</span>
									{/if}
								</button>
							{/if}
							{#if customFieldDefs.length > 0}
								<button
									type="button"
									class="px-4 py-2 text-sm font-medium border-b-2 transition-colors {contentTab === 'customFields' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}"
									onclick={() => (contentTab = 'customFields')}
								>
									{m.custom_field_title()}
								</button>
							{/if}
						</div>
					</div>

					{#if contentTab === 'steps'}
						<DetailSheetStepsTab
							precondition={version.precondition}
							steps={version.steps}
							stepFormat={version.stepFormat}
							expectedResult={version.expectedResult}
							automationKey={tc.automationKey}
							{canEdit}
							onstartedit={startDetailEdit}
						/>
					{:else if contentTab === 'comments'}
						<DetailSheetCommentsTab
							testCaseId={tc.id}
							{projectId}
							{currentUserId}
							{userRole}
							{canEdit}
						/>
					{:else if contentTab === 'issues'}
						<div>
							<!-- Action buttons -->
							<div class="flex gap-2 mb-4">
								{#if canEdit}
									<Button variant="outline" size="sm" class="h-7 text-xs" disabled={creatingIssue || issueCreateCooldown > 0} onclick={handleCreateIssue}>
										<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-1"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/><path d="M12 8v8"/></svg>
										{#if creatingIssue}
											{m.common_loading()}
										{:else if issueCreateCooldown > 0}
											{m.issue_link_create()} ({issueCreateCooldown}s)
										{:else}
											{m.issue_link_create()}
										{/if}
									</Button>
									<Button variant="outline" size="sm" class="h-7 text-xs" onclick={() => (showLinkForm = !showLinkForm)}>
										<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-1"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
										{m.issue_link_add()}
									</Button>
								{/if}
								{#if issueLinks.length > 0}
									<Button variant="outline" size="sm" class="h-7 text-xs ml-auto" disabled={syncingAll} onclick={syncAllIssues}>
										<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-1 {syncingAll ? 'animate-spin' : ''}"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
										{syncingAll ? m.common_loading() : m.common_refresh()}
									</Button>
								{/if}
							</div>
							{#if showLinkForm}
								<form
									onsubmit={(e) => { e.preventDefault(); handleLinkIssue(); }}
									class="mb-4 flex gap-2"
								>
									<Input
										placeholder={m.issue_link_url_placeholder()}
										type="url"
										bind:value={newIssueUrl}
										required
										class="flex-1 h-8 text-xs"
									/>
									<Button type="submit" size="sm" class="h-8 text-xs" disabled={linkingIssue || !newIssueUrl.trim()}>
										{linkingIssue ? m.common_loading() : m.issue_link_add()}
									</Button>
								</form>
							{/if}
							{#if issueLinks.length === 0}
								<div class="flex flex-col items-center justify-center py-8 text-center">
									<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground/40 mb-3"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
									<p class="text-muted-foreground text-sm">{m.issue_link_empty()}</p>
								</div>
							{:else}
								<div class="space-y-2">
									{#each issueLinks as link (link.id)}
										{@const isExpanded = expandedLinkId === link.id}
										<div class="rounded-lg border {isExpanded ? 'border-primary/30' : ''} transition-colors">
											<!-- Issue row header -->
											<button
												type="button"
												class="flex items-center justify-between gap-2 w-full px-3 py-2.5 text-sm hover:bg-muted/30 transition-colors text-left cursor-pointer"
												onclick={() => toggleIssueDetail(link.id)}
											>
												<div class="min-w-0 flex-1">
													<div class="flex items-center gap-2 mb-0.5">
														<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0 transition-transform {isExpanded ? 'rotate-90' : ''}"><polyline points="9 18 15 12 9 6"/></svg>
														{#if link.externalKey}
															<span class="font-mono text-xs font-medium shrink-0">{link.externalKey}</span>
														{/if}
														{#if link.status}
															<span class="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium {link.status === 'closed' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'}">
																{link.status}
															</span>
														{/if}
														<span class="text-[10px] text-muted-foreground uppercase">{link.provider}</span>
													</div>
													<span class="text-xs truncate block pl-5">
														{link.title || link.externalUrl}
													</span>
												</div>
												<div class="flex items-center gap-1 shrink-0" onclick={(e) => e.stopPropagation()}>
													<a href={link.externalUrl} target="_blank" rel="noopener noreferrer" class="text-muted-foreground hover:text-primary p-1" title="Open in new tab">
														<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>
													</a>
													{#if canEdit}
														<button type="button" class="text-muted-foreground hover:text-destructive p-1" onclick={() => handleRemoveIssueLink(link.id)}>
															<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
														</button>
													{/if}
												</div>
											</button>

											<!-- Expanded detail -->
											{#if isExpanded}
												<div class="border-t px-4 py-3">
													{#if detailFetching}
														<div class="space-y-2 py-2">
															<div class="h-4 w-3/4 bg-muted animate-pulse rounded"></div>
															<div class="h-3 w-1/2 bg-muted animate-pulse rounded"></div>
															<div class="h-16 w-full bg-muted animate-pulse rounded mt-3"></div>
														</div>
													{:else if issueDetail}
														<!-- Issue header info -->
														<div class="space-y-3">
															<div class="flex items-start justify-between gap-2">
																<h5 class="text-sm font-semibold leading-tight">{issueDetail.title}</h5>
																<span class="shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium {issueDetail.state === 'closed' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'}">
																	{issueDetail.state}
																</span>
															</div>

															<!-- Meta -->
															<div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
																<span class="flex items-center gap-1">
																	{#if issueDetail.authorAvatar}
																		<img src={issueDetail.authorAvatar} alt="" class="h-4 w-4 rounded-full" />
																	{/if}
																	{issueDetail.author}
																</span>
																<span>{formatDate(issueDetail.createdAt)}</span>
																{#if issueDetail.closedAt}
																	<span>Closed {formatDate(issueDetail.closedAt)}</span>
																{/if}
															</div>

															<!-- Labels -->
															{#if issueDetail.labels.length > 0}
																<div class="flex flex-wrap gap-1">
																	{#each issueDetail.labels as label (label.name)}
																		<span
																			class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium border"
																			style="background-color: {label.color}20; color: {label.color}; border-color: {label.color}40"
																		>
																			{label.name}
																		</span>
																	{/each}
																</div>
															{/if}

															<!-- Body -->
															{#if issueDetail.body}
																<div class="rounded bg-muted/40 p-3 text-xs whitespace-pre-wrap break-words leading-relaxed">
																	{issueDetail.body}
																</div>
															{/if}

															<!-- Comments -->
															{#if issueDetail.comments.length > 0}
																<div class="space-y-2 pt-2">
																	<h6 class="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
																		Comments ({issueDetail.comments.length})
																	</h6>
																	<div class="space-y-2">
																		{#each issueDetail.comments as comment (comment.id)}
																			<div class="rounded border p-2.5 text-xs">
																				<div class="flex items-center gap-2 mb-1.5 text-muted-foreground">
																					{#if comment.authorAvatar}
																						<img src={comment.authorAvatar} alt="" class="h-4 w-4 rounded-full" />
																					{/if}
																					<span class="font-medium text-foreground">{comment.author}</span>
																					<span>{formatDate(comment.createdAt)}</span>
																				</div>
																				<div class="whitespace-pre-wrap break-words leading-relaxed">{comment.body}</div>
																			</div>
																		{/each}
																	</div>
																</div>
															{:else}
																<p class="text-xs text-muted-foreground pt-1">No comments</p>
															{/if}

															<!-- Add comment form -->
															{#if canEdit}
																<div class="pt-3 border-t mt-3">
																	<form
																		onsubmit={(e) => { e.preventDefault(); postComment(); }}
																		class="space-y-2"
																	>
																		<Textarea
																			placeholder={m.comment_placeholder()}
																			bind:value={newComment}
																			rows={2}
																			class="text-xs"
																		/>
																		<div class="flex items-center justify-between">
																			<Button
																				type="button"
																				variant={issueDetail.state === 'closed' ? 'outline' : 'destructive'}
																				size="sm"
																				class="h-7 text-xs"
																				disabled={togglingState}
																				onclick={toggleIssueState}
																			>
																				{#if togglingState}
																					{m.common_loading()}
																				{:else if issueDetail.state === 'closed'}
																					Reopen
																				{:else}
																					Close Issue
																				{/if}
																			</Button>
																			<Button type="submit" size="sm" class="h-7 text-xs" disabled={postingComment || !newComment.trim()}>
																				{postingComment ? m.common_loading() : m.comment_submit()}
																			</Button>
																		</div>
																	</form>
																</div>
															{/if}
														</div>
													{:else}
														<p class="text-xs text-muted-foreground py-2">Failed to load issue details</p>
													{/if}
												</div>
											{/if}
										</div>
									{/each}
								</div>
							{/if}
						</div>
					{:else if contentTab === 'customFields'}
						<DetailSheetCustomFieldsTab
							{customFieldDefs}
							customFieldValues={(version.customFields ?? {}) as Record<string, unknown>}
						/>
					{/if}
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

<style>
	.detail-thin-scroll {
		scrollbar-width: thin;
		scrollbar-color: transparent transparent;
	}
	.detail-thin-scroll:hover {
		scrollbar-color: rgba(128, 128, 128, 0.35) transparent;
	}
	.detail-thin-scroll::-webkit-scrollbar {
		height: 3px;
	}
	.detail-thin-scroll::-webkit-scrollbar-track {
		background: transparent;
	}
	.detail-thin-scroll::-webkit-scrollbar-thumb {
		background: transparent;
		border-radius: 3px;
	}
	.detail-thin-scroll:hover::-webkit-scrollbar-thumb {
		background: rgba(128, 128, 128, 0.35);
	}
</style>
