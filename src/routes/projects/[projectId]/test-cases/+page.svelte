<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import TagBadge from '$lib/components/TagBadge.svelte';
	import { enhance } from '$app/forms';
	import * as m from '$lib/paraglide/messages.js';
	import { toast } from 'svelte-sonner';
	import { apiPut, apiPost, apiPatch, apiDelete } from '$lib/api-client';
	import { dragHandleZone, dragHandle, TRIGGERS, SHADOW_ITEM_MARKER_PROPERTY_NAME } from 'svelte-dnd-action';
	import { flip } from 'svelte/animate';
	import { untrack } from 'svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import ImportDialog from '$lib/components/ImportDialog.svelte';
	import VirtualList from '$lib/components/VirtualList.svelte';
	import AddCircleButton from '$lib/components/AddCircleButton.svelte';
	import TestCaseDetailSheet from './TestCaseDetailSheet.svelte';
	import FailureDetailsSheet from './FailureDetailsSheet.svelte';
	import FailWithDetailDialog from './FailWithDetailDialog.svelte';
	import TestCaseFilterBar from './TestCaseFilterBar.svelte';
	import TestCaseBulkActionBar from './TestCaseBulkActionBar.svelte';
	import PriorityBadge from '$lib/components/PriorityBadge.svelte';

	let { data } = $props();

	let importDialogOpen = $state(false);

	let quickTitles: Record<number, string> = $state({});
	let quickPriorities: Record<number, string> = $state({});
	let quickSubmittings: Record<number, boolean> = $state({});

	// Track which cell has an open status dropdown + its fixed position
	let openDropdown: { tcId: number; runId: number; x: number; y: number } | null = $state(null);

	// Inline editing state (key/title only)
	let editingCell: { tcId: number; field: 'key' | 'title'; value: string } | null = $state(null);

	// Priority popover state (fixed position like status dropdown)
	let priorityPopover: { tcId: number; currentValue: string; x: number; y: number } | null = $state(null);

	// Assignee popover state (fixed position like priority popover)
	let assigneePopover: { tcId: number; x: number; y: number } | null = $state(null);

	// Component references
	let detailSheet: TestCaseDetailSheet;
	let failureSheet: FailureDetailsSheet;
	let failDialog: FailWithDetailDialog;

	// --- Group view state (persisted in localStorage) ---
	const collapsedStorageKey = $derived(`tc-collapsed-${data.project.id}`);
	function loadCollapsedGroups(): Set<number> {
		try {
			const stored = localStorage.getItem(`tc-collapsed-${data.project.id}`);
			if (stored) return new Set(JSON.parse(stored));
		} catch { /* ignore */ }
		return new Set();
	}
	let collapsedGroups: Set<number> = $state(loadCollapsedGroups());
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
		priority: string;
		updatedBy: string;
		groupId: number | null;
		sortOrder: number;
		tags: { id: number; name: string; color: string }[];
		assignees: { userId: string; userName: string }[];
		approvalStatus: string;
		customFields: Record<string, unknown> | null;
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
	// Use untrack for deep iteration to avoid creating thousands of reactive subscriptions
	$effect(() => {
		// Track only top-level references so effect re-runs on navigation/invalidation
		const tcs = data.testCases;
		const groups = data.groups;

		untrack(() => {
			const tcArr = tcs as TcItem[];
			// Skip heavy computation when virtual scroll is active (dndGroups not rendered)
			if (tcArr.length > VIRTUAL_SCROLL_THRESHOLD) {
				dndGroups = [];
				dndUncategorized = [];
				return;
			}
			dndGroups = (groups as typeof data.groups).map((g) => ({
				id: g.id,
				name: g.name,
				sortOrder: g.sortOrder,
				color: g.color,
				items: tcArr
					.filter((tc) => tc.groupId === g.id)
					.sort((a, b) => a.sortOrder - b.sortOrder)
			}));
			dndUncategorized = tcArr
				.filter((tc) => tc.groupId === null)
				.sort((a, b) => a.sortOrder - b.sortOrder);
		});
	});

	const hasActiveFilters = $derived(!!data.search || !!data.priority || !!data.tagIds || !!data.groupId || !!data.createdBy || !!data.assigneeId || !!data.suiteId || !!data.execStatus || !!data.approvalStatus || data.customFieldFilters.length > 0);
	const flipDurationMs = 150;


	const basePath = $derived(`/projects/${data.project.id}/test-cases`);

	const selectedRuns = $derived(
		data.projectRuns.filter((r) => data.selectedRunIds.includes(r.id))
	);


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

	function getPriorityColor(name: string): string {
		return data.projectPriorities.find((p) => p.name === name)?.color ?? '#6b7280';
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

	let updatingExecIds = $state(new Set<number>());

	async function updateExecutionStatus(
		runId: number,
		executionId: number,
		newStatus: string,
		tcKey?: string
	) {
		if (newStatus === 'FAIL') {
			openDropdown = null;
			failDialog.open(runId, executionId, tcKey ?? '');
			return;
		}
		openDropdown = null;
		updatingExecIds.add(executionId);
		updatingExecIds = new Set(updatingExecIds);
		try {
			await apiPut(
				`/api/projects/${data.project.id}/test-runs/${runId}/executions/${executionId}/status`,
				{ status: newStatus }
			);
			await invalidateAll();
		} catch {
			// error toast handled by apiPut
		} finally {
			updatingExecIds.delete(executionId);
			updatingExecIds = new Set(updatingExecIds);
		}
	}

	async function deleteExecution(runId: number, executionId: number) {
		openDropdown = null;
		updatingExecIds.add(executionId);
		updatingExecIds = new Set(updatingExecIds);
		try {
			await apiDelete(
				`/api/projects/${data.project.id}/test-runs/${runId}/executions/${executionId}`
			);
			await invalidateAll();
		} catch {
			// error toast handled by apiDelete
		} finally {
			updatingExecIds.delete(executionId);
			updatingExecIds = new Set(updatingExecIds);
		}
	}

	async function addExecution(tcId: number, runId: number, event: MouseEvent) {
		// Capture position before async operations (element may unmount after invalidateAll)
		const btn = event.currentTarget as HTMLElement;
		const rect = btn.getBoundingClientRect();
		const pos = { x: rect.left + rect.width / 2, y: rect.bottom + 2 };

		try {
			await apiPost(
				`/api/projects/${data.project.id}/test-runs/${runId}/executions`,
				{ testCaseId: tcId }
			);
			await invalidateAll();
			// Open status dropdown at the captured position
			openDropdown = { tcId, runId, x: pos.x, y: pos.y };
		} catch {
			// error toast handled by apiPost
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
		if (assigneePopover && !target.closest('[data-assignee-popover]')) {
			assigneePopover = null;
		}
		if (editingCell && !target.closest('[data-inline-edit]')) {
			commitInlineEdit();
		}
	}

	const allStatuses = ['PENDING', 'PASS', 'FAIL', 'BLOCKED', 'SKIPPED'];
	const priorityOptions = $derived(data.projectPriorities);
	const execStatusOptions = ['PASS', 'FAIL', 'BLOCKED', 'SKIPPED', 'PENDING', 'NOT_EXECUTED'];

	const availableRuns = $derived(
		data.projectRuns.filter((r) => !data.selectedRunIds.includes(r.id))
	);

	const canEdit = $derived(data.userRole !== 'VIEWER');
	const canDelete = $derived(data.userRole === 'PROJECT_ADMIN' || data.userRole === 'ADMIN');

	const VIRTUAL_SCROLL_THRESHOLD = 200;
	const useVirtualScroll = $derived(data.testCases.length > VIRTUAL_SCROLL_THRESHOLD);
	const dndDisabled = $derived(hasActiveFilters || !canEdit || useVirtualScroll);

	// --- Custom field column visibility (persisted in localStorage) ---
	function loadVisibleCfCols(): Set<number> {
		try {
			const stored = localStorage.getItem(`tc-cf-cols-${data.project.id}`);
			if (stored) return new Set(JSON.parse(stored));
		} catch { /* ignore */ }
		return new Set();
	}
	let visibleCfCols: Set<number> = $state(loadVisibleCfCols());

	function toggleCfCol(fieldId: number) {
		const next = new Set(visibleCfCols);
		if (next.has(fieldId)) next.delete(fieldId);
		else next.add(fieldId);
		visibleCfCols = next;
		try {
			localStorage.setItem(`tc-cf-cols-${data.project.id}`, JSON.stringify([...next]));
		} catch { /* ignore */ }
	}

	const visibleCustomFields = $derived(
		data.projectCustomFields.filter((cf) => visibleCfCols.has(cf.id))
	);

	function formatCfValue(cf: { id: number; fieldType: string }, customFields: Record<string, unknown> | null): string {
		if (!customFields) return '';
		const val = customFields[String(cf.id)];
		if (val === undefined || val === null) return '';
		if (cf.fieldType === 'MULTISELECT' && Array.isArray(val)) return val.join(', ');
		if (cf.fieldType === 'CHECKBOX') return val ? 'Yes' : 'No';
		return String(val);
	}

	type FlatItem =
		| { _type: 'group-header'; group: GroupItem }
		| { _type: 'tc'; tc: TcItem }
		| { _type: 'quick-create'; groupKey: number }
		| { _type: 'uncat-header'; itemCount: number };

	const flatItems = $derived.by(() => {
		if (!useVirtualScroll) return [] as FlatItem[];
		// Track top-level references and lightweight reactive state
		const tcs = data.testCases;
		const groups = data.groups;
		const collapsedSnapshot = new Set(collapsedGroups);
		const editable = canEdit;
		const filtered = hasActiveFilters;

		// Heavy iteration inside untrack to avoid 5000+ reactive subscriptions
		return untrack(() => {
			const tcArr = tcs as TcItem[];
			const items: FlatItem[] = [];

			// Build group → TC map (O(n) instead of O(n * groups))
			const groupMap = new Map<number | null, TcItem[]>();
			for (const tc of tcArr) {
				const key = tc.groupId;
				if (!groupMap.has(key)) groupMap.set(key, []);
				groupMap.get(key)!.push(tc);
			}
			for (const arr of groupMap.values()) {
				arr.sort((a, b) => a.sortOrder - b.sortOrder);
			}

			for (const g of (groups as typeof data.groups)) {
				const groupTcs = groupMap.get(g.id) ?? [];
				if (filtered && groupTcs.length === 0) continue;
				items.push({
					_type: 'group-header',
					group: { id: g.id, name: g.name, sortOrder: g.sortOrder, color: g.color, items: groupTcs }
				});
				if (!collapsedSnapshot.has(g.id)) {
					for (const tc of groupTcs) {
						items.push({ _type: 'tc', tc });
					}
					if (editable) {
						items.push({ _type: 'quick-create', groupKey: g.id });
					}
				}
			}

			const uncatTcs = groupMap.get(null) ?? [];
			if (!filtered || uncatTcs.length > 0) {
				items.push({ _type: 'uncat-header', itemCount: uncatTcs.length });
				if (!collapsedSnapshot.has(-1)) {
					for (const tc of uncatTcs) {
						items.push({ _type: 'tc', tc });
					}
					if (editable) {
						items.push({ _type: 'quick-create', groupKey: -1 });
					}
				}
			}
			return items;
		});
	});


	// --- Inline editing (pencil icon click for key/title) ---
	async function flushInlineEdit() {
		if (!editingCell) return;
		const { tcId, field, value } = editingCell;
		const original = data.testCases.find((tc) => tc.id === tcId);
		if (!original) return;

		const originalValue = field === 'key' ? original.key : original.title;
		if (value.trim() === originalValue) return;

		try {
			await apiPatch(
				`/api/projects/${data.project.id}/test-cases/${tcId}`,
				{ [field]: value.trim() }
			);
			await invalidateAll();
		} catch {
			// error toast handled by apiPatch
		}
	}

	function startInlineEdit(tcId: number, field: 'key' | 'title', currentValue: string, e: Event) {
		e.stopPropagation();
		// Commit any pending edit before starting a new one
		if (editingCell && (editingCell.tcId !== tcId || editingCell.field !== field)) {
			flushInlineEdit();
		}
		editingCell = { tcId, field, value: currentValue };
	}

	async function commitInlineEdit() {
		if (!editingCell) return;
		await flushInlineEdit();
		editingCell = null;
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

	let updatingTcIds = $state(new Set<number>());

	async function selectPriority(tcId: number, newPriority: string) {
		priorityPopover = null;
		updatingTcIds.add(tcId);
		updatingTcIds = new Set(updatingTcIds);
		try {
			await apiPatch(
				`/api/projects/${data.project.id}/test-cases/${tcId}`,
				{ priority: newPriority }
			);
			await invalidateAll();
		} catch {
			// error toast handled by apiPatch
		} finally {
			updatingTcIds.delete(tcId);
			updatingTcIds = new Set(updatingTcIds);
		}
	}

	// --- Assignee popover ---
	function openAssigneePopover(tcId: number, event: MouseEvent) {
		event.stopPropagation();
		if (assigneePopover?.tcId === tcId) {
			assigneePopover = null;
		} else {
			const el = event.currentTarget as HTMLElement;
			const rect = el.getBoundingClientRect();
			assigneePopover = { tcId, x: rect.left + rect.width / 2, y: rect.bottom + 4 };
		}
	}

	async function toggleAssignee(tcId: number, userId: string) {
		const tc = data.testCases.find((t) => t.id === tcId);
		if (!tc || updatingTcIds.has(tcId)) return;
		const isAssigned = tc.assignees?.some((a) => a.userId === userId);
		const action = isAssigned ? 'removeAssignee' : 'assignAssignee';
		const formData = new FormData();
		formData.set('userId', userId);
		updatingTcIds.add(tcId);
		updatingTcIds = new Set(updatingTcIds);
		// Save popover state before invalidation
		const savedPopover = assigneePopover ? { ...assigneePopover } : null;
		try {
			const res = await fetch(
				`/projects/${data.project.id}/test-cases/${tcId}?/${action}`,
				{ method: 'POST', body: formData }
			);
			if (res.ok) {
				await invalidateAll();
				// Restore popover after data refresh
				if (savedPopover) assigneePopover = savedPopover;
			} else {
				toast.error(m.error_operation_failed());
			}
		} catch {
			toast.error(m.error_operation_failed());
		} finally {
			updatingTcIds.delete(tcId);
			updatingTcIds = new Set(updatingTcIds);
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

	// --- Group management ---
	function toggleGroupCollapse(groupId: number) {
		const next = new Set(collapsedGroups);
		if (next.has(groupId)) {
			next.delete(groupId);
		} else {
			next.add(groupId);
		}
		collapsedGroups = next;
		try {
			localStorage.setItem(collapsedStorageKey, JSON.stringify([...next]));
		} catch { /* ignore */ }
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
			await apiPatch(`/api/projects/${data.project.id}/test-case-groups/${gId}`, { name: newName });
			toast.success(m.group_updated());
			await invalidateAll();
		} catch {
			// error toast handled by apiPatch
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
			await apiDelete(
				`/api/projects/${data.project.id}/test-case-groups/${deleteGroupId}`
			);
			toast.success(m.group_deleted());
			deleteGroupOpen = false;
			deleteGroupId = null;
			await invalidateAll();
		} catch {
			// error toast handled by apiDelete
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
			await apiPut(`/api/projects/${data.project.id}/test-case-groups/reorder`, { groups: reorderPayload });
		} catch {
			// error toast handled by apiPut
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
			await apiPut(`/api/projects/${data.project.id}/test-cases/reorder`, { items });
		} catch {
			// error toast handled by apiPut
			await invalidateAll();
		}
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="space-y-4" onclick={handleClickOutside} onkeydown={(e) => { if (e.key === 'Escape') { openDropdown = null; editingCell = null; priorityPopover = null; assigneePopover = null; } }}>
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-2">
			<h2 class="text-lg font-semibold">{m.tc_title()}</h2>
			{#if data.testCases.length > 0}
				<span class="text-muted-foreground text-xs">{m.common_total_count({ count: data.testCases.length })}</span>
			{/if}
		</div>
		<div class="flex items-center gap-2">
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						<Button variant="outline" size="sm" {...props}>{m.tc_export()}</Button>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end">
					<DropdownMenu.Item
						onclick={() => { window.location.href = `/api/projects/${data.project.id}/test-cases/export?format=csv`; }}
					>
						{m.tc_export_csv()}
					</DropdownMenu.Item>
					<DropdownMenu.Item
						onclick={() => { window.location.href = `/api/projects/${data.project.id}/test-cases/export?format=json`; }}
					>
						{m.tc_export_json()}
					</DropdownMenu.Item>
				</DropdownMenu.Content>
			</DropdownMenu.Root>
			{#if data.userRole !== 'VIEWER'}
				<Button variant="outline" size="sm" onclick={() => (importDialogOpen = true)}>{m.tc_import()}</Button>
				<Button href="{basePath}/new" size="sm">{m.tc_new()}</Button>
			{/if}
		</div>
	</div>

	<TestCaseFilterBar
		{basePath}
		projectId={data.project.id}
		{canEdit}
		{hasActiveFilters}
		search={data.search}
		priority={data.priority}
		tagIds={data.tagIds}
		groupId={data.groupId}
		createdBy={data.createdBy}
		assigneeId={data.assigneeId}
		suiteId={data.suiteId}
		execStatus={data.execStatus}
		approvalStatus={data.approvalStatus}
		projectTags={data.projectTags}
		projectPriorities={data.projectPriorities}
		groups={data.groups}
		projectSuites={data.projectSuites}
		projectMembers={data.projectMembers}
		selectedRunIds={data.selectedRunIds}
		projectCustomFields={data.projectCustomFields}
		customFieldFilters={data.customFieldFilters}
		savedFilters={data.savedFilters}
	/>

	<!-- Column & Run selector row -->
	{#if data.projectCustomFields.length > 0 || data.projectRuns.length > 0}
		<div class="flex flex-wrap items-center gap-2">
			{#if data.projectCustomFields.length > 0}
				<Popover.Root>
					<Popover.Trigger>
						{#snippet child({ props })}
							<Button variant="outline" size="sm" class="h-7 px-2 text-xs" {...props}>
								{m.tc_columns()}{visibleCfCols.size > 0 ? ` (${visibleCfCols.size})` : ''}
							</Button>
						{/snippet}
					</Popover.Trigger>
					<Popover.Content class="w-48 p-2" align="start">
						{#each data.projectCustomFields as cf (cf.id)}
							<label class="flex items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-muted cursor-pointer">
								<Checkbox checked={visibleCfCols.has(cf.id)} onCheckedChange={() => toggleCfCol(cf.id)} />
								{cf.name}
							</label>
						{/each}
					</Popover.Content>
				</Popover.Root>
			{/if}
		</div>
	{/if}

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

	{#if selectedTcIds.size > 0 && canEdit}
		<TestCaseBulkActionBar
			{selectedTcIds}
			projectId={data.project.id}
			projectTags={data.projectTags}
			projectPriorities={data.projectPriorities}
			projectMembers={data.projectMembers}
			groups={data.groups}
			projectSuites={data.projectSuites}
			{canDelete}
			oncomplete={() => { selectedTcIds = new Set(); invalidateAll(); }}
			onclear={() => { selectedTcIds = new Set(); }}
		/>
	{/if}

	{#if data.testCases.length === 0 && !hasActiveFilters}
		<div
			class="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center"
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

		{#snippet avatarStack(assignees: { userId: string; userName: string }[])}
			{#if assignees && assignees.length > 0}
				<div class="flex -space-x-1.5">
					{#each assignees.slice(0, 3) as a (a.userId)}
						<span
							class="inline-flex h-5 w-5 items-center justify-center rounded-full bg-muted border-2 border-background text-[9px] font-medium uppercase leading-none"
							title={a.userName}
						>{a.userName.charAt(0)}</span>
					{/each}
					{#if assignees.length > 3}
						<span
							class="inline-flex h-5 w-5 items-center justify-center rounded-full bg-muted border-2 border-background text-[9px] font-medium leading-none text-muted-foreground"
						>+{assignees.length - 3}</span>
					{/if}
				</div>
			{:else if canEdit}
				<AddCircleButton size="sm" />
			{/if}
		{/snippet}

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
					<button type="button" class="truncate text-left hover:underline cursor-pointer" data-tip={tc.title} onclick={(e) => { e.stopPropagation(); detailSheet.open(tc.id); }}>{tc.title}</button>
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
			<!-- Approval Status -->
			{#if tc.approvalStatus && tc.approvalStatus !== 'DRAFT'}
				<span class="shrink-0 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium leading-none {tc.approvalStatus === 'IN_REVIEW' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' : tc.approvalStatus === 'APPROVED' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : tc.approvalStatus === 'REJECTED' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' : ''}">
					{tc.approvalStatus === 'IN_REVIEW' ? m.approval_in_review() : tc.approvalStatus === 'APPROVED' ? m.approval_approved() : tc.approvalStatus === 'REJECTED' ? m.approval_rejected() : tc.approvalStatus}
				</span>
			{/if}
			<!-- Priority -->
			{#if canEdit}
				<button
					type="button"
					data-priority-popover
					class="w-16 shrink-0 text-center"
					onclick={(e) => { e.stopPropagation(); openPriorityPopover(tc.id, tc.priority, e); }}
				>
					<PriorityBadge name={tc.priority} color={getPriorityColor(tc.priority)} />
				</button>
			{:else}
				<span class="w-16 shrink-0 text-center">
					<PriorityBadge name={tc.priority} color={getPriorityColor(tc.priority)} />
				</span>
			{/if}
			<!-- Tags -->
			{#if data.projectTags.length > 0}
				<div class="w-28 shrink-0 flex gap-0.5 items-center overflow-hidden">
					{#if tc.tags && tc.tags.length > 0}
						{#each tc.tags.slice(0, 3) as t (t.id)}
							<span
								class="rounded px-1 py-px text-[10px] leading-tight font-medium truncate max-w-[4rem]"
								style="background-color: {t.color}20; color: {t.color}"
								data-tip={t.name}
							>{t.name}</span>
						{/each}
						{#if tc.tags.length > 3}
							<span class="text-[10px] text-muted-foreground shrink-0">+{tc.tags.length - 3}</span>
						{/if}
					{/if}
				</div>
			{/if}
			<!-- Assignees -->
			{#if canEdit}
				<button
					type="button"
					data-assignee-popover
					class="w-16 shrink-0 flex items-center cursor-pointer rounded hover:bg-muted/50 transition-colors px-0.5 -mx-0.5"
					onclick={(e) => { e.stopPropagation(); openAssigneePopover(tc.id, e); }}
				>
					{@render avatarStack(tc.assignees)}
				</button>
			{:else}
				<div class="w-16 shrink-0 flex items-center">
					{@render avatarStack(tc.assignees)}
				</div>
			{/if}
			<span class="text-muted-foreground w-20 shrink-0 text-right truncate" data-tip={tc.updatedBy}>{tc.updatedBy}</span>
			<!-- Custom field columns -->
			{#each visibleCustomFields as cf (cf.id)}
				{@const cfVal = formatCfValue(cf, tc.customFields)}
				<span class="w-24 shrink-0 text-center truncate text-muted-foreground" data-tip={cfVal}>
					{#if cf.fieldType === 'URL' && cfVal}
						<a href={cfVal} target="_blank" rel="noopener noreferrer" class="text-primary hover:underline" onclick={(e) => e.stopPropagation()}>{cfVal}</a>
					{:else if cf.fieldType === 'CHECKBOX'}
						{#if tc.customFields?.[String(cf.id)]}
							<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="text-green-600 inline-block"><polyline points="20 6 9 17 4 12"/></svg>
						{:else if tc.customFields?.[String(cf.id)] === false}
							<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground inline-block"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
						{/if}
					{:else}
						{cfVal}
					{/if}
				</span>
			{/each}
			<!-- Test Run columns -->
			{#each selectedRuns as run (run.id)}
				{@const exec = data.executionMap[tc.id]?.[run.id]}
				<span class="w-16 shrink-0 text-center" onclick={(e) => e.stopPropagation()}>
					{#if exec}
						<button
							type="button"
							data-status-dropdown
							class="font-medium cursor-pointer {statusColor(exec.status)} hover:underline"
							onclick={(e) => toggleDropdown(tc.id, run.id, e)}
						>
							{exec.status}
						</button>
					{:else if canEdit}
						<AddCircleButton tip="Add to run" onclick={(e) => addExecution(tc.id, run.id, e)} />
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
						{#each priorityOptions as p (p.id)}
							<DropdownMenu.Item onclick={() => { quickPriorities[groupKey] = p.name; }} class="text-xs">
								<PriorityBadge name={p.name} color={p.color} />
							</DropdownMenu.Item>
						{/each}
					</DropdownMenu.Content>
				</DropdownMenu.Root>
				<Button type="submit" size="sm" class="h-6 shrink-0 px-2 text-xs" disabled={!(quickTitles[groupKey] ?? '').trim() || quickSubmittings[groupKey]}>
					{quickSubmittings[groupKey] ? '...' : '+'}
				</Button>
			</form>
		{/snippet}

		<div>
			<!-- Sticky Column header -->
			<div class="flex items-center gap-2 px-3 py-1.5 border-b bg-card sticky top-0 z-10 rounded-t-lg border-x border-t text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
				{#if canEdit}
					<input
						type="checkbox"
						class="h-3.5 w-3.5 shrink-0 rounded border-gray-300"
						checked={selectedTcIds.size === data.testCases.length && data.testCases.length > 0}
						onchange={toggleSelectAll}
					/>
				{/if}
				{#if !dndDisabled}<span class="w-6 shrink-0"></span>{/if}
				<span class="w-20 shrink-0 text-center">{m.common_key()}</span>
				<span class="flex-1 min-w-0 text-center">{m.common_title()}</span>
				<span class="w-16 shrink-0 text-center">{m.common_priority()}</span>
				{#if data.projectTags.length > 0}
					<span class="w-28 shrink-0 text-center">{m.tag_title()}</span>
				{/if}
				<span class="w-16 shrink-0 text-center">{m.assignee_title()}</span>
				<span class="w-20 shrink-0 text-center">{m.tc_updated_by()}</span>
				{#each visibleCustomFields as cf (cf.id)}
					<span class="w-24 shrink-0 text-center truncate" data-tip={cf.name}>{cf.name}</span>
				{/each}
				{#each selectedRuns as run (run.id)}
					<span class="w-16 shrink-0 text-center truncate" data-tip={run.name}>{run.name}</span>
				{/each}
			</div>

			<div class="rounded-b-lg border-x border-b bg-card">
			{#if useVirtualScroll}
				<!-- Virtual scroll mode -->
				<VirtualList items={flatItems} rowHeight={32} useWindowScroll>
					{#snippet children({ item })}
						{@const row = item as FlatItem}
						{#if row._type === 'group-header'}
							{@const group = row.group}
							<div class="flex items-center gap-2 px-3 py-1.5 border-b bg-muted/30 text-sm font-semibold">
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
						{:else if row._type === 'tc'}
							<div
								class="flex items-center gap-2 px-3 py-1.5 border-b hover:bg-muted/30 group/row text-xs"
							>
								{@render tcRow(row.tc)}
							</div>
						{:else if row._type === 'quick-create'}
							<div class="border-b bg-muted/10 text-xs">
								{@render quickCreateRow(row.groupKey)}
							</div>
						{:else}
							<div class="flex items-center gap-2 px-3 py-1.5 border-b bg-muted/20 text-sm font-semibold">
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
								<span class="text-xs text-muted-foreground font-normal">({(row as { itemCount: number }).itemCount})</span>
							</div>
						{/if}
					{/snippet}
				</VirtualList>
			{:else}
				<!-- Normal DnD grouped view -->
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
						{#if !hasActiveFilters || group.items.length > 0}
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
											class="flex items-center gap-2 px-3 py-1.5 border-b hover:bg-muted/30 group/row text-xs"
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
						{/if}
					</div>
					{/each}
				</div>

				<!-- Uncategorized section -->
				{#if !hasActiveFilters || dndUncategorized.length > 0}
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
									class="flex items-center gap-2 px-3 py-1.5 border-b hover:bg-muted/30 group/row text-xs"
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
				{/if}
			{/if}
		</div>

		{#if data.testCases.length === 0 && hasActiveFilters}
			<div class="flex flex-col items-center gap-2 py-6">
				<p class="text-center text-xs text-muted-foreground">{m.tc_empty_search()}</p>
				<a href={basePath} class="text-xs text-primary hover:underline">{m.common_clear_filters()}</a>
			</div>
		{/if}
		</div>
	{/if}

	<!-- Fixed-position status dropdown -->
	{#if openDropdown}
		{@const tcId = openDropdown.tcId}
		{@const runId = openDropdown.runId}
		{@const exec = data.executionMap[tcId]?.[runId]}
		{@const tcKey = data.testCases.find((tc) => tc.id === tcId)?.key ?? ''}
		{#if exec}
			<div
				data-status-dropdown
				class="fixed z-[9999] bg-popover border rounded-md shadow-lg py-1 min-w-[100px]"
				style="left: {openDropdown.x}px; top: {openDropdown.y}px; transform: translateX(-50%);"
			>
				{#each allStatuses as s}
					<button
						type="button"
						class="block w-full px-3 py-1.5 text-left text-xs hover:bg-muted cursor-pointer {statusColor(s)} {s === exec.status ? 'font-bold' : ''}"
						onclick={() => updateExecutionStatus(runId, exec.executionId, s, tcKey)}
					>
						{s}
					</button>
				{/each}
				{#if exec.status === 'FAIL'}
					<div class="border-t my-1"></div>
					<button
						type="button"
						class="block w-full px-3 py-1.5 text-left text-xs hover:bg-muted text-muted-foreground"
						onclick={() => { openDropdown = null; failureSheet.open(runId, exec.executionId); }}
					>
						{m.fail_details()}
					</button>
					<button
						type="button"
						class="block w-full px-3 py-1.5 text-left text-xs hover:bg-muted text-muted-foreground"
						onclick={() => { openDropdown = null; failDialog.open(runId, exec.executionId, tcKey); }}
					>
						{m.fail_add_detail()}
					</button>
				{/if}
				<div class="border-t my-1"></div>
				<button
					type="button"
					class="block w-full px-3 py-1.5 text-left text-xs hover:bg-destructive/10 cursor-pointer text-destructive"
					onclick={() => deleteExecution(runId, exec.executionId)}
				>
					{m.common_delete()}
				</button>
			</div>
		{/if}
	{/if}

	<!-- Fixed-position assignee popover -->
	{#if assigneePopover}
		{@const tcForPopover = data.testCases.find((tc) => tc.id === assigneePopover!.tcId)}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			data-assignee-popover
			class="fixed z-[9999] bg-popover border rounded-md shadow-lg py-1 min-w-[150px] max-h-[240px] overflow-y-auto"
			style="left: {assigneePopover.x}px; top: {assigneePopover.y}px; transform: translateX(-50%);"
			onclick={(e) => e.stopPropagation()}
		>
			{#each data.projectMembers as member (member.userId)}
				{@const isAssigned = tcForPopover?.assignees?.some((a) => a.userId === member.userId) ?? false}
				<button
					type="button"
					class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-muted transition-colors {isAssigned ? 'font-bold bg-muted/50' : ''}"
					onclick={() => toggleAssignee(assigneePopover!.tcId, member.userId)}
				>
					<span class="inline-flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[9px] font-medium uppercase shrink-0">{member.userName.charAt(0)}</span>
					<span class="truncate flex-1">{member.userName}</span>
					{#if isAssigned}
						<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="text-primary shrink-0"><polyline points="20 6 9 17 4 12"/></svg>
					{/if}
				</button>
			{/each}
			{#if data.projectMembers.length === 0}
				<div class="px-3 py-1.5 text-xs text-muted-foreground">-</div>
			{/if}
		</div>
	{/if}

	<!-- Fixed-position priority popover -->
	{#if priorityPopover}
		<div
			data-priority-popover
			class="fixed z-[9999] bg-popover border rounded-md shadow-lg py-1 min-w-[110px]"
			style="left: {priorityPopover.x}px; top: {priorityPopover.y}px; transform: translateX(-50%);"
		>
			{#each priorityOptions as p (p.id)}
				<button
					type="button"
					class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-muted transition-colors {p.name === priorityPopover.currentValue ? 'font-bold bg-muted/50' : ''}"
					onclick={() => selectPriority(priorityPopover!.tcId, p.name)}
				>
					<PriorityBadge name={p.name} color={p.color} />
					{#if p.name === priorityPopover.currentValue}
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

<TestCaseDetailSheet
	bind:this={detailSheet}
	projectId={data.project.id}
	{canEdit}
	{canDelete}
	projectPriorities={data.projectPriorities}
	onchange={() => invalidateAll()}
/>

<FailureDetailsSheet
	bind:this={failureSheet}
	projectId={data.project.id}
	onaddfailure={(runId, executionId, tcKey) => failDialog.open(runId, executionId, tcKey)}
/>

<FailWithDetailDialog
	bind:this={failDialog}
	projectId={data.project.id}
	onsubmitted={(runId, executionId) => {
		invalidateAll();
		failureSheet.refreshIfMatch(runId, executionId);
	}}
/>

<ImportDialog
	bind:open={importDialogOpen}
	projectId={data.project.id}
	onimported={() => invalidateAll()}
/>
