<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import * as Sheet from '$lib/components/ui/sheet/index.js';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import TagBadge from '$lib/components/TagBadge.svelte';
	import StepsEditor from '$lib/components/StepsEditor.svelte';
	import * as m from '$lib/paraglide/messages.js';
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import { dragHandleZone, dragHandle, TRIGGERS, SHADOW_ITEM_MARKER_PROPERTY_NAME } from 'svelte-dnd-action';
	import { flip } from 'svelte/animate';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import * as Select from '$lib/components/ui/select/index.js';

	let { data } = $props();

	let searchInput = $state('');
	let searchTimeout: ReturnType<typeof setTimeout>;
	let quickTitles: Record<number, string> = $state({});
	let quickPriorities: Record<number, string> = $state({});
	let quickSubmittings: Record<number, boolean> = $state({});

	// Track which cell has an open status dropdown + its fixed position
	let openDropdown: { tcId: number; runId: number; x: number; y: number } | null = $state(null);

	// Inline editing state (key/title only)
	let editingCell: { tcId: number; field: 'key' | 'title'; value: string } | null = $state(null);

	// Priority popover state (fixed position like status dropdown)
	let priorityPopover: { tcId: number; currentValue: string; x: number; y: number } | null = $state(null);

	// Sheet detail panel state
	let sheetOpen = $state(false);
	let selectedTcId: number | null = $state(null);
	let detailData: {
		testCase: { id: number; key: string; createdAt: string; latestVersion: any };
		versions: any[];
		assignedTags: { id: number; name: string; color: string }[];
		projectTags: { id: number; name: string; color: string }[];
		assignedAssignees: { userId: string; userName: string; userImage: string | null }[];
		projectMembers: { userId: string; userName: string; userImage: string | null }[];
	} | null = $state(null);
	let detailLoading = $state(false);
	let detailEditing = $state(false);
	let detailDeleteOpen = $state(false);
	let showVersions = $state(false);

	// Detail edit form state
	let editTitle = $state('');
	let editPriority = $state('MEDIUM');
	let editPrecondition = $state('');
	let editSteps: { action: string; expected: string }[] = $state([]);
	let editExpectedResult = $state('');
	let editRevision = $state(1);
	let editSaving = $state(false);

	// Lock state for sheet detail
	let sheetLockHolder = $state<{ userName: string } | null>(null);
	let sheetHeartbeatInterval: ReturnType<typeof setInterval> | undefined;

	// --- Group view state ---
	let collapsedGroups: Set<number> = $state(new Set());
	let newGroupName = $state('');
	let creatingGroup = $state(false);
	let editingGroupId: number | null = $state(null);
	let editingGroupName = $state('');
	let deleteGroupId: number | null = $state(null);
	let deleteGroupOpen = $state(false);

	// Checkbox selection state (bulk ops)
	let selectedTcIds = $state<Set<number>>(new Set());

	// DnD state for grouped view
	type TcItem = {
		id: number;
		key: string;
		title: string;
		priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
		updatedBy: string;
		groupId: number | null;
		sortOrder: number;
		tags: { id: number; name: string; color: string }[];
		assignees: { userId: string; userName: string }[];
		[SHADOW_ITEM_MARKER_PROPERTY_NAME]?: boolean;
	};
	type GroupItem = {
		id: number;
		name: string;
		sortOrder: number;
		color: string | null;
		items: TcItem[];
		[SHADOW_ITEM_MARKER_PROPERTY_NAME]?: boolean;
	};

	let dndGroups: GroupItem[] = $state([]);
	let dndUncategorized: TcItem[] = $state([]);

	// Sync dndGroups/dndUncategorized from server data when it changes
	$effect(() => {
		const tcs = data.testCases as TcItem[];
		dndGroups = data.groups.map((g) => ({
			id: g.id,
			name: g.name,
			sortOrder: g.sortOrder,
			color: g.color,
			items: tcs
				.filter((tc) => tc.groupId === g.id)
				.sort((a, b) => a.sortOrder - b.sortOrder)
		}));
		dndUncategorized = tcs
			.filter((tc) => tc.groupId === null)
			.sort((a, b) => a.sortOrder - b.sortOrder);
	});

	const selectedTagIds = $derived(
		(data.tagIds ?? '')
			.split(',')
			.map(Number)
			.filter((id) => !isNaN(id) && id > 0)
	);
	const hasActiveFilters = $derived(!!data.search || !!data.priority || selectedTagIds.length > 0 || !!data.groupId || !!data.createdBy || !!data.assigneeId);
	const flipDurationMs = 150;

	$effect(() => {
		searchInput = data.search;
	});

	const basePath = $derived(`/projects/${data.project.id}/test-cases`);

	const selectedRuns = $derived(
		data.projectRuns.filter((r) => data.selectedRunIds.includes(r.id))
	);

	function handleSearch() {
		clearTimeout(searchTimeout);
		searchTimeout = setTimeout(() => {
			const params = new URLSearchParams(page.url.searchParams);
			if (searchInput) {
				params.set('search', searchInput);
			} else {
				params.delete('search');
			}
			goto(`${basePath}?${params.toString()}`, { keepFocus: true });
		}, 300);
	}

	function setPriority(p: string) {
		const params = new URLSearchParams(page.url.searchParams);
		if (p) {
			params.set('priority', p);
		} else {
			params.delete('priority');
		}
		goto(`${basePath}?${params.toString()}`);
	}

	function toggleTag(id: number) {
		const params = new URLSearchParams(page.url.searchParams);
		const current = new Set(selectedTagIds);
		if (current.has(id)) {
			current.delete(id);
		} else {
			current.add(id);
		}
		if (current.size > 0) {
			params.set('tagIds', [...current].join(','));
		} else {
			params.delete('tagIds');
		}
		goto(`${basePath}?${params.toString()}`);
	}

	function clearAllTags() {
		const params = new URLSearchParams(page.url.searchParams);
		params.delete('tagIds');
		goto(`${basePath}?${params.toString()}`);
	}

	function setGroupFilter(gId: string) {
		const params = new URLSearchParams(page.url.searchParams);
		if (gId) {
			params.set('groupId', gId);
		} else {
			params.delete('groupId');
		}
		goto(`${basePath}?${params.toString()}`);
	}

	function setCreatedByFilter(userId: string) {
		const params = new URLSearchParams(page.url.searchParams);
		if (userId) {
			params.set('createdBy', userId);
		} else {
			params.delete('createdBy');
		}
		goto(`${basePath}?${params.toString()}`);
	}

	function setAssigneeFilter(userId: string) {
		const params = new URLSearchParams(page.url.searchParams);
		if (userId) {
			params.set('assigneeId', userId);
		} else {
			params.delete('assigneeId');
		}
		goto(`${basePath}?${params.toString()}`);
	}

	function clearAllFilters() {
		goto(basePath);
	}

	function addRunColumn(runId: string) {
		if (!runId) return;
		const params = new URLSearchParams(page.url.searchParams);
		const current = data.selectedRunIds;
		const id = Number(runId);
		if (current.includes(id)) return;
		const newIds = [...current, id];
		params.set('runIds', newIds.join(','));
		goto(`${basePath}?${params.toString()}`);
	}

	function removeRunColumn(runId: number) {
		const params = new URLSearchParams(page.url.searchParams);
		const newIds = data.selectedRunIds.filter((id) => id !== runId);
		params.set('runIds', newIds.join(','));
		goto(`${basePath}?${params.toString()}`);
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

	function statusColor(status: string): string {
		switch (status) {
			case 'PASS':
				return 'text-green-600 dark:text-green-400';
			case 'FAIL':
				return 'text-red-600 dark:text-red-400';
			case 'BLOCKED':
				return 'text-yellow-600 dark:text-yellow-400';
			case 'SKIPPED':
				return 'text-gray-500';
			case 'PENDING':
				return 'text-muted-foreground';
			default:
				return 'text-muted-foreground';
		}
	}

	async function updateExecutionStatus(
		runId: number,
		executionId: number,
		newStatus: string
	) {
		openDropdown = null;
		try {
			const res = await fetch(
				`/api/projects/${data.project.id}/test-runs/${runId}/executions/${executionId}/status`,
				{
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ status: newStatus })
				}
			);
			if (res.ok) {
				await invalidateAll();
			}
		} catch {
			// silently fail
		}
	}

	async function addExecution(tcId: number, runId: number, event: MouseEvent) {
		// Capture position before async operations (element may unmount after invalidateAll)
		const btn = event.currentTarget as HTMLElement;
		const rect = btn.getBoundingClientRect();
		const pos = { x: rect.left + rect.width / 2, y: rect.bottom + 2 };

		try {
			const res = await fetch(
				`/api/projects/${data.project.id}/test-runs/${runId}/executions`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ testCaseId: tcId })
				}
			);
			if (res.ok) {
				await invalidateAll();
				// Open status dropdown at the captured position
				openDropdown = { tcId, runId, x: pos.x, y: pos.y };
			} else {
				let msg = `Error ${res.status}`;
				try {
					const err = await res.json();
					msg = err.error || err.message || msg;
				} catch { /* non-JSON response */ }
				toast.error(msg);
			}
		} catch (e) {
			toast.error('Network error: ' + String(e));
		}
	}

	function toggleDropdown(tcId: number, runId: number, event: MouseEvent) {
		if (openDropdown?.tcId === tcId && openDropdown?.runId === runId) {
			openDropdown = null;
		} else {
			const btn = event.currentTarget as HTMLElement;
			const rect = btn.getBoundingClientRect();
			openDropdown = { tcId, runId, x: rect.left + rect.width / 2, y: rect.bottom + 2 };
		}
	}

	function handleClickOutside(event: MouseEvent) {
		const target = event.target as HTMLElement;
		if (openDropdown && !target.closest('[data-status-dropdown]')) {
			openDropdown = null;
		}
		if (priorityPopover && !target.closest('[data-priority-popover]')) {
			priorityPopover = null;
		}
		if (editingCell && !target.closest('[data-inline-edit]')) {
			commitInlineEdit();
		}
	}

	const priorities = ['', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
	const allStatuses = ['PENDING', 'PASS', 'FAIL', 'BLOCKED', 'SKIPPED'];

	const availableRuns = $derived(
		data.projectRuns.filter((r) => !data.selectedRunIds.includes(r.id))
	);

	const canEdit = $derived(data.userRole !== 'VIEWER');
	const canDelete = $derived(data.userRole === 'PROJECT_ADMIN' || data.userRole === 'ADMIN');
	const dndDisabled = $derived(hasActiveFilters || !canEdit);

	// --- Inline editing (pencil icon click for key/title) ---
	function startInlineEdit(tcId: number, field: 'key' | 'title', currentValue: string, e: Event) {
		e.stopPropagation();
		editingCell = { tcId, field, value: currentValue };
	}

	async function commitInlineEdit() {
		if (!editingCell) return;
		const { tcId, field, value } = editingCell;
		const original = data.testCases.find((tc) => tc.id === tcId);
		if (!original) { editingCell = null; return; }

		const originalValue = field === 'key' ? original.key : original.title;
		if (value.trim() === originalValue) {
			editingCell = null;
			return;
		}

		editingCell = null;
		try {
			const res = await fetch(
				`/api/projects/${data.project.id}/test-cases/${tcId}`,
				{
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ [field]: value.trim() })
				}
			);
			if (res.ok) {
				await invalidateAll();
			} else {
				const err = await res.json();
				toast.error(err.error || 'Failed to update');
			}
		} catch {
			toast.error('Failed to update');
		}
	}

	function handleInlineKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			(e.currentTarget as HTMLInputElement).blur();
		} else if (e.key === 'Escape') {
			editingCell = null;
		}
	}

	// --- Priority popover ---
	function openPriorityPopover(tcId: number, currentValue: string, event: MouseEvent) {
		event.stopPropagation();
		if (priorityPopover?.tcId === tcId) {
			priorityPopover = null;
		} else {
			const el = event.currentTarget as HTMLElement;
			const rect = el.getBoundingClientRect();
			priorityPopover = { tcId, currentValue, x: rect.left + rect.width / 2, y: rect.bottom + 4 };
		}
	}

	async function selectPriority(tcId: number, newPriority: string) {
		priorityPopover = null;
		try {
			const res = await fetch(
				`/api/projects/${data.project.id}/test-cases/${tcId}`,
				{
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ priority: newPriority })
				}
			);
			if (res.ok) {
				await invalidateAll();
			} else {
				const err = await res.json();
				toast.error(err.error || 'Failed to update');
			}
		} catch {
			toast.error('Failed to update');
		}
	}

	const priorityOptions = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

	// --- Sheet detail panel ---
	async function openDetail(tcId: number) {
		selectedTcId = tcId;
		detailLoading = true;
		detailEditing = false;
		showVersions = false;
		sheetLockHolder = null;
		sheetOpen = true;

		try {
			const res = await fetch(`/api/projects/${data.project.id}/test-cases/${tcId}`);
			if (res.ok) {
				detailData = await res.json();
			} else {
				toast.error('Failed to load test case');
				sheetOpen = false;
			}
			// Check lock status
			const lockRes = await fetch(`/api/projects/${data.project.id}/test-cases/${tcId}/lock`);
			if (lockRes.ok) {
				const lockData = await lockRes.json();
				if (lockData.locked) sheetLockHolder = lockData.holder;
			}
		} catch {
			toast.error('Failed to load test case');
			sheetOpen = false;
		} finally {
			detailLoading = false;
		}
	}

	async function startDetailEdit() {
		if (!detailData?.testCase.latestVersion || !selectedTcId) return;

		const lockUrl = `/api/projects/${data.project.id}/test-cases/${selectedTcId}/lock`;
		const res = await fetch(lockUrl, { method: 'POST' });
		const result = await res.json();
		if (!res.ok) {
			toast.error(m.lock_conflict({ name: result.holder?.userName ?? '?' }));
			sheetLockHolder = result.holder;
			return;
		}
		sheetLockHolder = null;

		// Start heartbeat
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
			fetch(`/api/projects/${data.project.id}/test-cases/${selectedTcId}/lock`, {
				method: 'DELETE'
			}).catch(() => {});
		}
		sheetLockHolder = null;
	}

	async function saveDetailEdit() {
		if (!selectedTcId) return;
		editSaving = true;

		try {
			const res = await fetch(
				`/api/projects/${data.project.id}/test-cases/${selectedTcId}`,
				{
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						title: editTitle,
						precondition: editPrecondition,
						steps: editSteps,
						expectedResult: editExpectedResult,
						priority: editPriority,
						revision: editRevision
					})
				}
			);
			if (res.ok) {
				toast.success('Test case updated');
				detailEditing = false;
				releaseSheetLock();
				await invalidateAll();
				await openDetail(selectedTcId);
			} else {
				const err = await res.json();
				toast.error(err.error || 'Failed to update');
			}
		} catch {
			toast.error('Failed to update');
		} finally {
			editSaving = false;
		}
	}

	async function deleteFromSheet() {
		if (!selectedTcId) return;
		try {
			const res = await fetch(
				`/api/projects/${data.project.id}/test-cases/${selectedTcId}`,
				{ method: 'DELETE' }
			);
			if (res.ok) {
				toast.success(m.tc_deleted());
				sheetOpen = false;
				detailData = null;
				selectedTcId = null;
				detailDeleteOpen = false;
				await invalidateAll();
			} else {
				toast.error('Failed to delete');
			}
		} catch {
			toast.error('Failed to delete');
		}
	}

	async function assignTag(tagId: number) {
		if (!selectedTcId) return;
		const formData = new FormData();
		formData.set('tagId', String(tagId));
		try {
			const res = await fetch(
				`/projects/${data.project.id}/test-cases/${selectedTcId}?/assignTag`,
				{ method: 'POST', body: formData }
			);
			if (res.ok) {
				toast.success(m.tag_assigned());
				await invalidateAll();
				await openDetail(selectedTcId);
			}
		} catch {
			toast.error('Failed to assign tag');
		}
	}

	async function removeTag(tagId: number) {
		if (!selectedTcId) return;
		const formData = new FormData();
		formData.set('tagId', String(tagId));
		try {
			const res = await fetch(
				`/projects/${data.project.id}/test-cases/${selectedTcId}?/removeTag`,
				{ method: 'POST', body: formData }
			);
			if (res.ok) {
				toast.success(m.tag_removed());
				await invalidateAll();
				await openDetail(selectedTcId);
			}
		} catch {
			toast.error('Failed to remove tag');
		}
	}

	// --- Assignee helpers for sheet detail ---
	async function assignAssignee(userId: string) {
		if (!selectedTcId) return;
		const formData = new FormData();
		formData.set('userId', userId);
		try {
			const res = await fetch(
				`/projects/${data.project.id}/test-cases/${selectedTcId}?/assignAssignee`,
				{ method: 'POST', body: formData }
			);
			if (res.ok) {
				toast.success(m.assignee_assigned());
				await invalidateAll();
				await openDetail(selectedTcId);
			}
		} catch {
			toast.error('Failed to assign assignee');
		}
	}

	async function removeAssignee(userId: string) {
		if (!selectedTcId) return;
		const formData = new FormData();
		formData.set('userId', userId);
		try {
			const res = await fetch(
				`/projects/${data.project.id}/test-cases/${selectedTcId}?/removeAssignee`,
				{ method: 'POST', body: formData }
			);
			if (res.ok) {
				toast.success(m.assignee_removed());
				await invalidateAll();
				await openDetail(selectedTcId);
			}
		} catch {
			toast.error('Failed to remove assignee');
		}
	}

	// --- Checkbox selection helpers ---
	function toggleTcSelection(tcId: number) {
		const next = new Set(selectedTcIds);
		if (next.has(tcId)) {
			next.delete(tcId);
		} else {
			next.add(tcId);
		}
		selectedTcIds = next;
	}

	function toggleSelectAll() {
		if (selectedTcIds.size === data.testCases.length) {
			selectedTcIds = new Set();
		} else {
			selectedTcIds = new Set(data.testCases.map((tc) => tc.id));
		}
	}

	// --- Bulk operations ---
	let bulkLoading = $state(false);
	let bulkDeleteOpen = $state(false);

	async function bulkAction(action: string, extra: Record<string, unknown> = {}) {
		if (selectedTcIds.size === 0 || bulkLoading) return;
		bulkLoading = true;
		try {
			const res = await fetch(`/api/projects/${data.project.id}/test-cases/bulk`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action,
					testCaseIds: [...selectedTcIds],
					...extra
				})
			});
			if (res.ok) {
				const result = await res.json();
				if (action === 'delete') {
					toast.success(m.tc_bulk_deleted({ count: result.affected }));
				} else if (action === 'clone') {
					toast.success(m.tc_bulk_cloned({ count: result.affected }));
				} else {
					toast.success(m.tc_bulk_success({ count: result.affected }));
				}
				selectedTcIds = new Set();
				await invalidateAll();
			} else {
				const err = await res.json();
				toast.error(err.error || 'Bulk operation failed');
			}
		} catch {
			toast.error('Bulk operation failed');
		} finally {
			bulkLoading = false;
			bulkDeleteOpen = false;
		}
	}

	// --- Clone from sheet ---
	async function cloneFromSheet() {
		if (!selectedTcId) return;
		try {
			const res = await fetch(
				`/api/projects/${data.project.id}/test-cases/${selectedTcId}/clone`,
				{ method: 'POST' }
			);
			if (res.ok) {
				const result = await res.json();
				toast.success(m.tc_cloned());
				await invalidateAll();
				await openDetail(result.newTestCaseId);
			} else {
				const err = await res.json();
				toast.error(err.error || 'Failed to clone');
			}
		} catch {
			toast.error('Failed to clone');
		}
	}

	// --- Group management ---
	function toggleGroupCollapse(groupId: number) {
		const next = new Set(collapsedGroups);
		if (next.has(groupId)) {
			next.delete(groupId);
		} else {
			next.add(groupId);
		}
		collapsedGroups = next;
	}

	async function createGroup() {
		if (!newGroupName.trim() || creatingGroup) return;
		creatingGroup = true;
		try {
			const res = await fetch(`/api/projects/${data.project.id}/test-case-groups`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: newGroupName.trim() })
			});
			if (res.ok) {
				toast.success(m.group_created());
				newGroupName = '';
				await invalidateAll();
			} else {
				const err = await res.json();
				toast.error(err.error || 'Failed to create group');
			}
		} catch {
			toast.error('Failed to create group');
		} finally {
			creatingGroup = false;
		}
	}

	function startEditGroupName(groupId: number, currentName: string) {
		editingGroupId = groupId;
		editingGroupName = currentName;
	}

	async function commitGroupNameEdit() {
		if (editingGroupId === null) return;
		const gId = editingGroupId;
		const newName = editingGroupName.trim();
		editingGroupId = null;

		if (!newName) return;
		// Check if name actually changed
		const group = data.groups.find((g) => g.id === gId);
		if (group && group.name === newName) return;

		try {
			const res = await fetch(`/api/projects/${data.project.id}/test-case-groups/${gId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: newName })
			});
			if (res.ok) {
				toast.success(m.group_updated());
				await invalidateAll();
			} else {
				const err = await res.json();
				toast.error(err.error || 'Failed to update group');
			}
		} catch {
			toast.error('Failed to update group');
		}
	}

	function handleGroupNameKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			(e.currentTarget as HTMLInputElement).blur();
		} else if (e.key === 'Escape') {
			editingGroupId = null;
		}
	}

	async function deleteGroup() {
		if (deleteGroupId === null) return;
		try {
			const res = await fetch(
				`/api/projects/${data.project.id}/test-case-groups/${deleteGroupId}`,
				{ method: 'DELETE' }
			);
			if (res.ok) {
				toast.success(m.group_deleted());
				deleteGroupOpen = false;
				deleteGroupId = null;
				await invalidateAll();
			} else {
				toast.error('Failed to delete group');
			}
		} catch {
			toast.error('Failed to delete group');
		}
	}

	// --- DnD handlers ---
	function handleGroupDndConsider(e: CustomEvent<{ items: GroupItem[]; info: { trigger: string } }>) {
		dndGroups = e.detail.items;
	}

	async function handleGroupDndFinalize(e: CustomEvent<{ items: GroupItem[]; info: { trigger: string } }>) {
		dndGroups = e.detail.items;
		// Persist new order
		const reorderPayload = dndGroups.map((g, i) => ({ id: g.id, sortOrder: (i + 1) * 1000 }));
		try {
			const res = await fetch(`/api/projects/${data.project.id}/test-case-groups/reorder`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ groups: reorderPayload })
			});
			if (!res.ok) {
				toast.error('Failed to reorder groups');
				await invalidateAll();
			}
		} catch {
			toast.error('Failed to reorder groups');
			await invalidateAll();
		}
	}

	function handleTcDndConsider(groupId: number | null, e: CustomEvent<{ items: TcItem[]; info: { trigger: string } }>) {
		if (groupId === null) {
			dndUncategorized = e.detail.items;
		} else {
			const gIdx = dndGroups.findIndex((g) => g.id === groupId);
			if (gIdx >= 0) {
				dndGroups[gIdx].items = e.detail.items;
			}
		}
	}

	async function handleTcDndFinalize(groupId: number | null, e: CustomEvent<{ items: TcItem[]; info: { trigger: string } }>) {
		if (groupId === null) {
			dndUncategorized = e.detail.items;
		} else {
			const gIdx = dndGroups.findIndex((g) => g.id === groupId);
			if (gIdx >= 0) {
				dndGroups[gIdx].items = e.detail.items;
			}
		}

		// Collect all items from all zones and persist
		const items: { id: number; groupId: number | null; sortOrder: number }[] = [];
		for (const g of dndGroups) {
			for (let i = 0; i < g.items.length; i++) {
				const tc = g.items[i];
				if (tc[SHADOW_ITEM_MARKER_PROPERTY_NAME]) continue;
				items.push({ id: tc.id, groupId: g.id, sortOrder: (i + 1) * 1000 });
			}
		}
		for (let i = 0; i < dndUncategorized.length; i++) {
			const tc = dndUncategorized[i];
			if (tc[SHADOW_ITEM_MARKER_PROPERTY_NAME]) continue;
			items.push({ id: tc.id, groupId: null, sortOrder: (i + 1) * 1000 });
		}

		if (items.length === 0) return;

		try {
			const res = await fetch(`/api/projects/${data.project.id}/test-cases/reorder`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ items })
			});
			if (!res.ok) {
				toast.error('Failed to reorder');
				await invalidateAll();
			}
		} catch {
			toast.error('Failed to reorder');
			await invalidateAll();
		}
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="space-y-4" onclick={handleClickOutside} onkeydown={(e) => { if (e.key === 'Escape') { openDropdown = null; editingCell = null; priorityPopover = null; } }}>
	<div class="flex items-center justify-between">
		<h2 class="text-lg font-semibold">{m.tc_title()}</h2>
		<div class="flex items-center gap-2">
			{#if data.userRole !== 'VIEWER'}
				<Button href="{basePath}/new" size="sm">{m.tc_new()}</Button>
			{/if}
		</div>
	</div>

	<div class="flex flex-wrap items-center gap-2">
		<Input
			placeholder={m.tc_search_placeholder()}
			class="h-7 max-w-xs text-xs"
			bind:value={searchInput}
			oninput={handleSearch}
		/>
		<div class="flex gap-1">
			{#each priorities as p (p)}
				<Button
					variant={data.priority === p ? 'default' : 'outline'}
					size="sm"
					class="h-7 px-2 text-xs"
					onclick={() => setPriority(p)}
				>
					{p || m.common_all()}
				</Button>
			{/each}
		</div>
		{#if data.projectTags.length > 0}
			<div class="flex gap-1">
				<Button
					variant={selectedTagIds.length === 0 ? 'default' : 'outline'}
					size="sm"
					class="h-7 px-2 text-xs"
					onclick={clearAllTags}
				>
					{m.common_all()}
				</Button>
				{#each data.projectTags as t (t.id)}
					<Button
						variant={selectedTagIds.includes(t.id) ? 'default' : 'outline'}
						size="sm"
						class="h-7 px-2 text-xs"
						onclick={() => toggleTag(t.id)}
					>
						<span class="mr-1 inline-block h-2 w-2 rounded-full" style="background-color: {t.color}"></span>
						{t.name}
					</Button>
				{/each}
			</div>
		{/if}

		<!-- Group filter -->
		{#if data.groups.length > 0}
			<Select.Root
				type="single"
				value={data.groupId ?? ''}
				onValueChange={(v: string) => setGroupFilter(v === '__all__' ? '' : v)}
			>
				<Select.Trigger size="sm" class="h-7 px-2 text-xs">
					{#if data.groupId === 'uncategorized'}
						{m.tc_filter_uncategorized()}
					{:else if data.groupId}
						{data.groups.find((g) => String(g.id) === data.groupId)?.name ?? data.groupId}
					{:else}
						{m.tc_filter_group()}: {m.common_all()}
					{/if}
				</Select.Trigger>
				<Select.Content>
					<Select.Item value="__all__" label="{m.tc_filter_group()}: {m.common_all()}" />
					<Select.Item value="uncategorized" label={m.tc_filter_uncategorized()} />
					{#each data.groups as g (g.id)}
						<Select.Item value={String(g.id)} label={g.name} />
					{/each}
				</Select.Content>
			</Select.Root>
		{/if}

		<!-- CreatedBy filter -->
		{#if data.projectMembers.length > 0}
			<Select.Root
				type="single"
				value={data.createdBy ?? ''}
				onValueChange={(v: string) => setCreatedByFilter(v === '__all__' ? '' : v)}
			>
				<Select.Trigger size="sm" class="h-7 px-2 text-xs">
					{#if data.createdBy}
						{data.projectMembers.find((mb) => mb.userId === data.createdBy)?.userName ?? data.createdBy}
					{:else}
						{m.tc_filter_created_by()}: {m.common_all()}
					{/if}
				</Select.Trigger>
				<Select.Content>
					<Select.Item value="__all__" label="{m.tc_filter_created_by()}: {m.common_all()}" />
					{#each data.projectMembers as member}
						<Select.Item value={member.userId} label={member.userName} />
					{/each}
				</Select.Content>
			</Select.Root>
		{/if}

		<!-- Assignee filter -->
		{#if data.projectMembers.length > 0}
			<Select.Root
				type="single"
				value={data.assigneeId ?? ''}
				onValueChange={(v: string) => setAssigneeFilter(v === '__all__' ? '' : v)}
			>
				<Select.Trigger size="sm" class="h-7 px-2 text-xs">
					{#if data.assigneeId}
						{data.projectMembers.find((mb) => mb.userId === data.assigneeId)?.userName ?? data.assigneeId}
					{:else}
						{m.tc_filter_assignee()}: {m.common_all()}
					{/if}
				</Select.Trigger>
				<Select.Content>
					<Select.Item value="__all__" label="{m.tc_filter_assignee()}: {m.common_all()}" />
					{#each data.projectMembers as member}
						<Select.Item value={member.userId} label={member.userName} />
					{/each}
				</Select.Content>
			</Select.Root>
		{/if}

		<!-- Clear all filters -->
		{#if hasActiveFilters}
			<Button
				variant="ghost"
				size="sm"
				class="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
				onclick={clearAllFilters}
			>
				{m.tc_filter_clear()}
			</Button>
		{/if}

		<!-- New group input -->
		{#if canEdit}
			<div class="flex items-center gap-1 ml-auto">
				<Input
					placeholder={m.group_name_placeholder()}
					class="h-7 w-40 text-xs"
					bind:value={newGroupName}
					onkeydown={(e) => { if (e.key === 'Enter') createGroup(); }}
				/>
				<Button
					size="sm"
					class="h-7 px-2 text-xs"
					disabled={!newGroupName.trim() || creatingGroup}
					onclick={createGroup}
				>
					{m.group_new()}
				</Button>
			</div>
		{/if}
	</div>

	<!-- Run column selector -->
	{#if data.projectRuns.length > 0}
		<div class="flex flex-wrap items-center gap-2">
			{#if availableRuns.length > 0}
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<Button variant="outline" size="sm" class="h-7 px-2 text-xs" {...props}>
								{m.tc_add_run_column()}
								<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="ml-1"><polyline points="6 9 12 15 18 9"/></svg>
							</Button>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="start" class="min-w-[180px]">
						{#each availableRuns as run (run.id)}
							<DropdownMenu.Item onclick={() => addRunColumn(String(run.id))} class="text-xs">
								{run.name} ({run.environment})
							</DropdownMenu.Item>
						{/each}
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			{/if}
			{#each selectedRuns as run (run.id)}
				<span class="bg-secondary inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs">
					{run.name}
					<button
						type="button"
						class="text-muted-foreground hover:text-foreground ml-0.5"
						onclick={() => removeRunColumn(run.id)}
					>
						✕
					</button>
				</span>
			{/each}
		</div>
	{/if}

	<!-- Bulk Action Bar -->
	{#if selectedTcIds.size > 0 && canEdit}
		<div class="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/50 px-4 py-2">
			<span class="text-sm font-medium">{m.tc_bulk_selected({ count: selectedTcIds.size })}</span>
			<div class="h-4 w-px bg-border"></div>

			<!-- Bulk Add Tag -->
			{#if data.projectTags.length > 0}
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<Button variant="outline" size="sm" class="h-7 text-xs" disabled={bulkLoading} {...props}>{m.tc_bulk_add_tag()}</Button>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="start" class="min-w-[140px]">
						{#each data.projectTags as t (t.id)}
							<DropdownMenu.Item onclick={() => bulkAction('addTag', { tagId: t.id })} class="text-xs">
								<span class="mr-1.5 inline-block h-2 w-2 rounded-full" style="background-color: {t.color}"></span>
								{t.name}
							</DropdownMenu.Item>
						{/each}
					</DropdownMenu.Content>
				</DropdownMenu.Root>

				<!-- Bulk Remove Tag -->
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<Button variant="outline" size="sm" class="h-7 text-xs" disabled={bulkLoading} {...props}>{m.tc_bulk_remove_tag()}</Button>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="start" class="min-w-[140px]">
						{#each data.projectTags as t (t.id)}
							<DropdownMenu.Item onclick={() => bulkAction('removeTag', { tagId: t.id })} class="text-xs">
								<span class="mr-1.5 inline-block h-2 w-2 rounded-full" style="background-color: {t.color}"></span>
								{t.name}
							</DropdownMenu.Item>
						{/each}
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			{/if}

			<!-- Bulk Add Assignee -->
			{#if data.projectMembers.length > 0}
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<Button variant="outline" size="sm" class="h-7 text-xs" disabled={bulkLoading} {...props}>{m.tc_bulk_add_assignee()}</Button>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="start" class="min-w-[140px]">
						{#each data.projectMembers as member}
							<DropdownMenu.Item onclick={() => bulkAction('addAssignee', { userId: member.userId })} class="text-xs">
								{member.userName}
							</DropdownMenu.Item>
						{/each}
					</DropdownMenu.Content>
				</DropdownMenu.Root>

				<!-- Bulk Remove Assignee -->
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<Button variant="outline" size="sm" class="h-7 text-xs" disabled={bulkLoading} {...props}>{m.tc_bulk_remove_assignee()}</Button>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="start" class="min-w-[140px]">
						{#each data.projectMembers as member}
							<DropdownMenu.Item onclick={() => bulkAction('removeAssignee', { userId: member.userId })} class="text-xs">
								{member.userName}
							</DropdownMenu.Item>
						{/each}
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			{/if}

			<!-- Bulk Set Priority -->
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						<Button variant="outline" size="sm" class="h-7 text-xs" disabled={bulkLoading} {...props}>{m.tc_bulk_set_priority()}</Button>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="start" class="min-w-[120px]">
					{#each priorityOptions as p}
						<DropdownMenu.Item onclick={() => bulkAction('setPriority', { priority: p })} class="text-xs">
							<Badge variant={priorityVariant(p)} class="text-[10px] px-1.5 py-0 pointer-events-none">{p}</Badge>
						</DropdownMenu.Item>
					{/each}
				</DropdownMenu.Content>
			</DropdownMenu.Root>

			<!-- Bulk Move to Group -->
			{#if data.groups.length > 0}
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<Button variant="outline" size="sm" class="h-7 text-xs" disabled={bulkLoading} {...props}>{m.tc_bulk_move_group()}</Button>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="start" class="min-w-[140px]">
						<DropdownMenu.Item onclick={() => bulkAction('moveToGroup', { groupId: null })} class="text-xs">
							{m.tc_filter_uncategorized()}
						</DropdownMenu.Item>
						{#each data.groups as g (g.id)}
							<DropdownMenu.Item onclick={() => bulkAction('moveToGroup', { groupId: g.id })} class="text-xs">
								{g.name}
							</DropdownMenu.Item>
						{/each}
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			{/if}

			<!-- Bulk Clone -->
			<Button variant="outline" size="sm" class="h-7 text-xs" disabled={bulkLoading} onclick={() => bulkAction('clone')}>
				{m.tc_bulk_clone()}
			</Button>

			<!-- Bulk Delete -->
			{#if canDelete}
				<AlertDialog.Root bind:open={bulkDeleteOpen}>
					<AlertDialog.Trigger>
						{#snippet child({ props })}
							<Button variant="destructive" size="sm" class="h-7 text-xs" disabled={bulkLoading} {...props}>{m.tc_bulk_delete()}</Button>
						{/snippet}
					</AlertDialog.Trigger>
					<AlertDialog.Portal>
						<AlertDialog.Overlay />
						<AlertDialog.Content>
							<AlertDialog.Header>
								<AlertDialog.Title>{m.tc_bulk_delete_title()}</AlertDialog.Title>
								<AlertDialog.Description>
									{m.tc_bulk_delete_confirm({ count: selectedTcIds.size })}
								</AlertDialog.Description>
							</AlertDialog.Header>
							<AlertDialog.Footer>
								<AlertDialog.Cancel>{m.common_cancel()}</AlertDialog.Cancel>
								<Button variant="destructive" disabled={bulkLoading} onclick={() => bulkAction('delete')}>{m.common_delete()}</Button>
							</AlertDialog.Footer>
						</AlertDialog.Content>
					</AlertDialog.Portal>
				</AlertDialog.Root>
			{/if}

			<Button variant="ghost" size="sm" class="h-7 text-xs ml-auto" onclick={() => { selectedTcIds = new Set(); }}>
				{m.common_cancel()}
			</Button>
		</div>
	{/if}

	{#if data.testCases.length === 0 && !hasActiveFilters}
		<div
			class="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="48"
				height="48"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="1.5"
				stroke-linecap="round"
				stroke-linejoin="round"
				class="text-muted-foreground mb-4"
			>
				<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
				<path d="M14 2v6h6" />
				<path d="M16 13H8" />
				<path d="M16 17H8" />
				<path d="M10 9H8" />
			</svg>
			<h3 class="text-lg font-semibold">{m.tc_empty_title()}</h3>
			<p class="text-muted-foreground mt-1 text-sm">{m.tc_empty_create()}</p>
			{#if data.userRole !== 'VIEWER'}
				<Button href="{basePath}/new" class="mt-4">{m.tc_create()}</Button>
			{/if}
		</div>
	{:else}
		<!-- ===== GROUPED VIEW ===== -->
		{#if hasActiveFilters}
			<p class="text-xs text-muted-foreground italic">Drag & drop is disabled while filters are active.</p>
		{/if}

		{#snippet tcRow(tc: TcItem)}
			{#if canEdit}
				<input
					type="checkbox"
					class="h-3.5 w-3.5 shrink-0 rounded border-gray-300"
					checked={selectedTcIds.has(tc.id)}
					onclick={(e) => { e.stopPropagation(); toggleTcSelection(tc.id); }}
				/>
			{/if}
			{#if !dndDisabled}
				<span use:dragHandle data-drag-handle-tc class="cursor-grab text-muted-foreground hover:text-foreground w-6 shrink-0 flex justify-center" onclick={(e) => e.stopPropagation()}>
					<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>
				</span>
			{/if}
			<!-- Key -->
			<span class="font-mono text-muted-foreground w-20 shrink-0 group/key inline-flex items-center gap-0.5">
				{#if editingCell?.tcId === tc.id && editingCell?.field === 'key'}
					<!-- svelte-ignore a11y_autofocus -->
					<input
						data-inline-edit
						type="text"
						class="border-primary bg-background h-5 w-full rounded border px-1 text-xs font-mono outline-none ring-1 ring-primary/30"
						bind:value={editingCell.value}
						onblur={commitInlineEdit}
						onkeydown={handleInlineKeydown}
						onclick={(e) => e.stopPropagation()}
						autofocus
					/>
				{:else}
					{tc.key}
					{#if canEdit}
						<button
							type="button"
							aria-label="Edit key"
							class="opacity-0 group-hover/key:opacity-100 text-muted-foreground hover:text-foreground transition-opacity shrink-0 p-0.5 -m-0.5 rounded hover:bg-muted"
							onclick={(e) => startInlineEdit(tc.id, 'key', tc.key, e)}
						>
							<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
						</button>
					{/if}
				{/if}
			</span>
			<!-- Title -->
			<span class="font-medium truncate flex-1 min-w-0 group/title inline-flex items-center gap-0.5">
				{#if editingCell?.tcId === tc.id && editingCell?.field === 'title'}
					<!-- svelte-ignore a11y_autofocus -->
					<input
						data-inline-edit
						type="text"
						class="border-primary bg-background h-5 w-full rounded border px-1 text-xs outline-none ring-1 ring-primary/30"
						bind:value={editingCell.value}
						onblur={commitInlineEdit}
						onkeydown={handleInlineKeydown}
						onclick={(e) => e.stopPropagation()}
						autofocus
					/>
				{:else}
					<span class="truncate">{tc.title}</span>
					{#if canEdit}
						<button
							type="button"
							aria-label="Edit title"
							class="opacity-0 group-hover/title:opacity-100 text-muted-foreground hover:text-foreground transition-opacity shrink-0 p-0.5 -m-0.5 rounded hover:bg-muted"
							onclick={(e) => startInlineEdit(tc.id, 'title', tc.title, e)}
						>
							<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
						</button>
					{/if}
				{/if}
			</span>
			<!-- Priority -->
			{#if canEdit}
				<button
					type="button"
					data-priority-popover
					class="w-16 shrink-0 text-center"
					onclick={(e) => { e.stopPropagation(); openPriorityPopover(tc.id, tc.priority, e); }}
				>
					<Badge variant={priorityVariant(tc.priority)} class="text-[10px] px-1.5 py-0 cursor-pointer hover:ring-1 hover:ring-ring/30 transition-all">{tc.priority}</Badge>
				</button>
			{:else}
				<span class="w-16 shrink-0 text-center">
					<Badge variant={priorityVariant(tc.priority)} class="text-[10px] px-1.5 py-0">{tc.priority}</Badge>
				</span>
			{/if}
			<!-- Tags -->
			{#if data.projectTags.length > 0}
				<div class="w-24 shrink-0 flex gap-0.5 overflow-hidden">
					{#if tc.tags && tc.tags.length > 0}
						{#each tc.tags as t (t.id)}
							<TagBadge name={t.name} color={t.color} />
						{/each}
					{/if}
				</div>
			{/if}
			<!-- Assignees -->
			<div class="w-24 shrink-0 flex gap-0.5 overflow-hidden">
				{#if tc.assignees && tc.assignees.length > 0}
					{#each tc.assignees.slice(0, 2) as a (a.userId)}
						<Badge variant="outline" class="text-[10px] px-1.5 py-0 truncate">{a.userName}</Badge>
					{/each}
					{#if tc.assignees.length > 2}
						<span class="text-[10px] text-muted-foreground">+{tc.assignees.length - 2}</span>
					{/if}
				{/if}
			</div>
			<span class="text-muted-foreground w-20 shrink-0 text-right truncate">{tc.updatedBy}</span>
			<!-- Test Run columns -->
			{#each selectedRuns as run (run.id)}
				{@const exec = data.executionMap[tc.id]?.[run.id]}
				<span class="w-16 shrink-0 text-center" onclick={(e) => e.stopPropagation()}>
					{#if exec}
						<button
							type="button"
							data-status-dropdown
							class="font-medium {statusColor(exec.status)} hover:underline"
							onclick={(e) => toggleDropdown(tc.id, run.id, e)}
						>
							{exec.status}
						</button>
					{:else if canEdit}
						<button
							type="button"
							class="text-muted-foreground/50 hover:text-primary hover:bg-primary/10 rounded-full h-5 w-5 inline-flex items-center justify-center transition-colors"
							title="Add to run"
							onclick={(e) => addExecution(tc.id, run.id, e)}
						>
							<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/></svg>
						</button>
					{:else}
						<span class="text-muted-foreground">-</span>
					{/if}
				</span>
			{/each}
		{/snippet}

		{#snippet quickCreateRow(groupKey: number)}
			<form
				method="POST"
				action="?/quickCreate"
				class="flex items-center gap-2 px-3 py-1.5"
				use:enhance={() => {
					quickSubmittings[groupKey] = true;
					return async ({ result }) => {
						quickSubmittings[groupKey] = false;
						if (result.type === 'success') {
							quickTitles[groupKey] = '';
							quickPriorities[groupKey] = 'MEDIUM';
							await invalidateAll();
						}
					};
				}}
			>
				{#if groupKey !== -1}
					<input type="hidden" name="groupId" value={String(groupKey)} />
				{/if}
				{#if canEdit}<span class="w-3.5 shrink-0"></span>{/if}
				{#if !dndDisabled}<span class="w-6 shrink-0"></span>{/if}
				<span class="w-20 shrink-0"></span>
				<Input
					name="title"
					placeholder={m.tc_quick_create_placeholder()}
					class="h-6 flex-1 min-w-0 text-xs"
					value={quickTitles[groupKey] ?? ''}
					oninput={(e) => { quickTitles[groupKey] = (e.currentTarget as HTMLInputElement).value; }}
				/>
				<input type="hidden" name="priority" value={quickPriorities[groupKey] ?? 'MEDIUM'} />
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<Button variant="outline" size="sm" class="h-6 px-1.5 text-xs shrink-0" {...props}>
								{quickPriorities[groupKey] ?? 'MEDIUM'}
								<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="ml-0.5"><polyline points="6 9 12 15 18 9"/></svg>
							</Button>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="start" class="min-w-[100px]">
						{#each priorityOptions as p}
							<DropdownMenu.Item onclick={() => { quickPriorities[groupKey] = p; }} class="text-xs">
								<Badge variant={priorityVariant(p)} class="text-[10px] px-1.5 py-0 pointer-events-none">{p}</Badge>
							</DropdownMenu.Item>
						{/each}
					</DropdownMenu.Content>
				</DropdownMenu.Root>
				<Button type="submit" size="sm" class="h-6 shrink-0 px-2 text-xs" disabled={!(quickTitles[groupKey] ?? '').trim() || quickSubmittings[groupKey]}>
					{quickSubmittings[groupKey] ? '...' : '+'}
				</Button>
			</form>
		{/snippet}

		<div class="rounded-lg border bg-card overflow-hidden">
			<!-- Column header -->
			<div class="flex items-center gap-2 px-3 py-1.5 border-b bg-muted/50 sticky top-0 z-10 text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
				{#if canEdit}
					<input
						type="checkbox"
						class="h-3.5 w-3.5 shrink-0 rounded border-gray-300"
						checked={selectedTcIds.size === data.testCases.length && data.testCases.length > 0}
						onchange={toggleSelectAll}
					/>
				{/if}
				{#if !dndDisabled}<span class="w-6 shrink-0"></span>{/if}
				<span class="w-20 shrink-0">{m.common_key()}</span>
				<span class="flex-1 min-w-0">{m.common_title()}</span>
				<span class="w-16 shrink-0 text-center">{m.common_priority()}</span>
				{#if data.projectTags.length > 0}
					<span class="w-24 shrink-0">{m.tag_title()}</span>
				{/if}
				<span class="w-24 shrink-0">{m.assignee_title()}</span>
				<span class="w-20 shrink-0 text-right">{m.tc_updated_by()}</span>
				{#each selectedRuns as run (run.id)}
					<span class="w-16 shrink-0 text-center truncate" title={run.name}>{run.name}</span>
				{/each}
			</div>

			<!-- Groups DnD zone -->
			<div
				use:dragHandleZone={{
					items: dndGroups,
					flipDurationMs,
					type: 'groups',
					dragDisabled: dndDisabled
				}}
				onconsider={(e) => handleGroupDndConsider(e)}
				onfinalize={(e) => handleGroupDndFinalize(e)}
			>
				{#each dndGroups as group (group.id)}
					<div animate:flip={{ duration: flipDurationMs }}>
						<!-- Group separator row -->
						<div class="flex items-center gap-2 px-3 py-1.5 border-b bg-muted/30 text-sm font-semibold">
							{#if !dndDisabled}
								<span use:dragHandle data-drag-handle-group class="cursor-grab text-muted-foreground hover:text-foreground w-6 shrink-0 flex justify-center" title="Drag to reorder">
									<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>
								</span>
							{/if}
							<button
								type="button"
								class="text-muted-foreground hover:text-foreground transition-colors"
								onclick={() => toggleGroupCollapse(group.id)}
							>
								{#if collapsedGroups.has(group.id)}
									<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
								{:else}
									<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
								{/if}
							</button>
							{#if group.color}
								<span class="h-2.5 w-2.5 rounded-full shrink-0" style="background-color: {group.color}"></span>
							{/if}
							{#if editingGroupId === group.id}
								<!-- svelte-ignore a11y_autofocus -->
								<input
									type="text"
									class="border-primary bg-background h-6 rounded border px-1.5 text-xs font-semibold outline-none ring-1 ring-primary/30 flex-1"
									bind:value={editingGroupName}
									onblur={commitGroupNameEdit}
									onkeydown={handleGroupNameKeydown}
									autofocus
								/>
							{:else}
								<button
									type="button"
									class="text-sm font-semibold hover:underline text-left"
									ondblclick={() => { if (canEdit) startEditGroupName(group.id, group.name); }}
								>
									{group.name}
								</button>
							{/if}
							<span class="text-xs text-muted-foreground font-normal">({group.items.length})</span>
							<div class="ml-auto flex items-center gap-1">
								{#if canEdit}
									<button
										type="button"
										class="text-muted-foreground hover:text-foreground p-0.5 rounded hover:bg-muted transition-colors"
										title="Edit name"
										onclick={() => startEditGroupName(group.id, group.name)}
									>
										<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
									</button>
								{/if}
								{#if canDelete}
									<button
										type="button"
										class="text-muted-foreground hover:text-destructive p-0.5 rounded hover:bg-muted transition-colors"
										title="Delete group"
										onclick={() => { deleteGroupId = group.id; deleteGroupOpen = true; }}
									>
										<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
									</button>
								{/if}
							</div>
						</div>

						<!-- Group content (TC list) -->
						{#if !collapsedGroups.has(group.id)}
							<div
								use:dragHandleZone={{
									items: group.items,
									flipDurationMs,
									type: 'testcases',
									dragDisabled: dndDisabled
								}}
								onconsider={(e) => handleTcDndConsider(group.id, e)}
								onfinalize={(e) => handleTcDndFinalize(group.id, e)}
								class="min-h-[32px]"
							>
								{#each group.items as tc (tc.id)}
									<div
										animate:flip={{ duration: flipDurationMs }}
										class="flex items-center gap-2 px-3 py-1.5 border-b hover:bg-muted/30 cursor-pointer group/row text-xs"
										onclick={() => openDetail(tc.id)}
										role="button"
										tabindex="0"
										onkeydown={(e) => { if (e.key === 'Enter') openDetail(tc.id); }}
									>
										{@render tcRow(tc)}
									</div>
								{/each}
							</div>

							{#if canEdit}
								<div class="border-b bg-muted/10 text-xs">
									{@render quickCreateRow(group.id)}
								</div>
							{/if}
						{/if}
					</div>
				{/each}
			</div>

			<!-- Uncategorized section -->
			<div>
				<div class="flex items-center gap-2 px-3 py-1.5 border-b bg-muted/20 text-sm font-semibold">
					{#if !dndDisabled}<span class="w-6 shrink-0"></span>{/if}
					<button
						type="button"
						class="text-muted-foreground hover:text-foreground transition-colors"
						onclick={() => toggleGroupCollapse(-1)}
					>
						{#if collapsedGroups.has(-1)}
							<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
						{:else}
							<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
						{/if}
					</button>
					<span class="text-muted-foreground">{m.group_uncategorized()}</span>
					<span class="text-xs text-muted-foreground font-normal">({dndUncategorized.length})</span>
				</div>

				{#if !collapsedGroups.has(-1)}
					<div
						use:dragHandleZone={{
							items: dndUncategorized,
							flipDurationMs,
							type: 'testcases',
							dragDisabled: dndDisabled
						}}
						onconsider={(e) => handleTcDndConsider(null, e)}
						onfinalize={(e) => handleTcDndFinalize(null, e)}
						class="min-h-[32px]"
					>
						{#each dndUncategorized as tc (tc.id)}
							<div
								animate:flip={{ duration: flipDurationMs }}
								class="flex items-center gap-2 px-3 py-1.5 border-b hover:bg-muted/30 cursor-pointer group/row text-xs"
								onclick={() => openDetail(tc.id)}
								role="button"
								tabindex="0"
								onkeydown={(e) => { if (e.key === 'Enter') openDetail(tc.id); }}
							>
								{@render tcRow(tc)}
							</div>
						{/each}
					</div>

					{#if canEdit}
						<div class="bg-muted/10 text-xs">
							{@render quickCreateRow(-1)}
						</div>
					{/if}
				{/if}
			</div>
		</div>

		{#if data.testCases.length === 0 && hasActiveFilters}
			<p class="text-center text-xs text-muted-foreground py-4">{m.tc_empty_search()}</p>
		{/if}
	{/if}

	<!-- Fixed-position status dropdown -->
	{#if openDropdown}
		{@const tcId = openDropdown.tcId}
		{@const runId = openDropdown.runId}
		{@const exec = data.executionMap[tcId]?.[runId]}
		{#if exec}
			<div
				data-status-dropdown
				class="fixed z-[9999] bg-popover border rounded-md shadow-lg py-1 min-w-[100px]"
				style="left: {openDropdown.x}px; top: {openDropdown.y}px; transform: translateX(-50%);"
			>
				{#each allStatuses as s}
					<button
						type="button"
						class="block w-full px-3 py-1.5 text-left text-xs hover:bg-muted {statusColor(s)} {s === exec.status ? 'font-bold' : ''}"
						onclick={() => updateExecutionStatus(runId, exec.executionId, s)}
					>
						{s}
					</button>
				{/each}
			</div>
		{/if}
	{/if}

	<!-- Fixed-position priority popover -->
	{#if priorityPopover}
		<div
			data-priority-popover
			class="fixed z-[9999] bg-popover border rounded-md shadow-lg py-1 min-w-[110px]"
			style="left: {priorityPopover.x}px; top: {priorityPopover.y}px; transform: translateX(-50%);"
		>
			{#each priorityOptions as p}
				<button
					type="button"
					class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-muted transition-colors {p === priorityPopover.currentValue ? 'font-bold bg-muted/50' : ''}"
					onclick={() => selectPriority(priorityPopover!.tcId, p)}
				>
					<Badge variant={priorityVariant(p)} class="text-[10px] px-1.5 py-0 pointer-events-none">{p}</Badge>
					{#if p === priorityPopover.currentValue}
						<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="text-primary ml-auto"><polyline points="20 6 9 17 4 12"/></svg>
					{/if}
				</button>
			{/each}
		</div>
	{/if}
</div>

<!-- Group delete confirmation -->
<AlertDialog.Root bind:open={deleteGroupOpen}>
	<AlertDialog.Portal>
		<AlertDialog.Overlay />
		<AlertDialog.Content>
			<AlertDialog.Header>
				<AlertDialog.Title>{m.group_delete_title()}</AlertDialog.Title>
				<AlertDialog.Description>
					{m.group_delete_confirm()}
				</AlertDialog.Description>
			</AlertDialog.Header>
			<AlertDialog.Footer>
				<AlertDialog.Cancel onclick={() => { deleteGroupId = null; }}>{m.common_cancel()}</AlertDialog.Cancel>
				<Button variant="destructive" onclick={deleteGroup}>{m.common_delete()}</Button>
			</AlertDialog.Footer>
		</AlertDialog.Content>
	</AlertDialog.Portal>
</AlertDialog.Root>

<!-- Detail Sheet Panel -->
<Sheet.Root bind:open={sheetOpen} onOpenChange={(open) => { if (!open) { if (detailEditing) releaseSheetLock(); detailEditing = false; detailData = null; selectedTcId = null; } }}>
	<Sheet.Content side="right" class="sm:max-w-2xl w-full overflow-y-auto p-0 data-[state=open]:duration-300 data-[state=closed]:duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-end data-[state=closed]:slide-out-to-end">
		{#if detailLoading}
			<!-- Loading skeleton -->
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
								<Badge variant={priorityVariant(version.priority)} class="text-xs">{version.priority}</Badge>
							{/if}
							<span class="text-muted-foreground text-xs">v{version?.versionNo ?? 0}</span>
						</div>
						<h3 class="text-lg font-semibold leading-tight">{version?.title ?? ''}</h3>
						<p class="text-muted-foreground text-xs">
							Created {new Date(tc.createdAt).toLocaleDateString()}
						</p>
					</div>
				</div>

				<!-- Lock indicator + Action buttons -->
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
									<button type="button" class="text-muted-foreground hover:text-destructive ml-0.5 transition-colors" onclick={() => removeTag(t.id)}>&times;</button>
								</span>
							{:else}
								<TagBadge name={t.name} color={t.color} />
							{/if}
						{/each}
						{#if canEdit}
							{@const unassignedTags = detailData.projectTags.filter(
								(pt) => !detailData!.assignedTags.some((at) => at.id === pt.id)
							)}
							{#if unassignedTags.length > 0}
								<DropdownMenu.Root>
									<DropdownMenu.Trigger>
										{#snippet child({ props })}
											<button type="button" class="border-input bg-background h-6 rounded-md border px-2 text-xs hover:bg-muted/50 transition-colors cursor-pointer" {...props}>
												+ {m.tag_assign()}
											</button>
										{/snippet}
									</DropdownMenu.Trigger>
									<DropdownMenu.Content align="start" class="min-w-[140px]">
										{#each unassignedTags as t (t.id)}
											<DropdownMenu.Item onclick={() => assignTag(t.id)} class="text-xs">
												<span class="mr-1.5 inline-block h-2 w-2 rounded-full" style="background-color: {t.color}"></span>
												{t.name}
											</DropdownMenu.Item>
										{/each}
									</DropdownMenu.Content>
								</DropdownMenu.Root>
							{/if}
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
									<button type="button" class="text-muted-foreground hover:text-destructive ml-0.5 transition-colors" onclick={() => removeAssignee(a.userId)}>&times;</button>
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
												<Badge variant={priorityVariant(editPriority)} class="text-[10px] px-1.5 py-0 pointer-events-none">{editPriority}</Badge>
											</span>
											<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground"><polyline points="6 9 12 15 18 9"/></svg>
										</Button>
									{/snippet}
								</DropdownMenu.Trigger>
								<DropdownMenu.Content class="min-w-[160px]">
									{#each priorityOptions as p}
										<DropdownMenu.Item onclick={() => { editPriority = p; }} class="text-sm">
											<Badge variant={priorityVariant(p)} class="text-[10px] px-1.5 py-0 pointer-events-none mr-2">{p}</Badge>
											{p === 'LOW' ? m.priority_low() : p === 'MEDIUM' ? m.priority_medium() : p === 'HIGH' ? m.priority_high() : m.priority_critical()}
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
						<div class="flex items-center gap-1.5 mb-3">
							<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground"><path d="M12 8v4l3 3"/><circle cx="12" cy="12" r="10"/></svg>
							<h4 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{m.tc_detail_version_history()}</h4>
						</div>
						{#if detailData.versions.length === 0}
							<p class="text-muted-foreground text-sm">{m.tc_detail_no_versions()}</p>
						{:else}
							<div class="space-y-1.5">
								{#each detailData.versions as v (v.id)}
									<div class="rounded-lg border p-3 transition-colors {v.id === version?.id ? 'border-primary/50 bg-primary/5' : 'hover:bg-muted/30'}">
										<div class="flex items-center justify-between">
											<div class="flex items-center gap-2">
												<span class="text-xs font-semibold {v.id === version?.id ? 'text-primary' : ''}">v{v.versionNo}</span>
												{#if v.id === version?.id}
													<span class="text-[10px] bg-primary/10 text-primary rounded px-1.5 py-0.5">latest</span>
												{/if}
											</div>
											<Badge variant={priorityVariant(v.priority)} class="text-[10px]">{v.priority}</Badge>
										</div>
										<p class="mt-1 text-sm truncate">{v.title}</p>
										<div class="text-muted-foreground mt-1 text-xs">
											{v.updatedBy} &middot; {new Date(v.createdAt).toLocaleDateString()}
										</div>
									</div>
								{/each}
							</div>
						{/if}
					</div>
				{/if}
			</div>
		{/if}
	</Sheet.Content>
</Sheet.Root>
