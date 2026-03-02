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
	import { dragHandleZone, dragHandle, TRIGGERS, SHADOW_ITEM_MARKER_PROPERTY_NAME } from 'svelte-dnd-action';
	import { flip } from 'svelte/animate';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import ImportDialog from '$lib/components/ImportDialog.svelte';
	import VirtualList from '$lib/components/VirtualList.svelte';
	import TestCaseDetailSheet from './TestCaseDetailSheet.svelte';
	import FailureDetailsSheet from './FailureDetailsSheet.svelte';
	import FailWithDetailDialog from './FailWithDetailDialog.svelte';

	let { data } = $props();

	let importDialogOpen = $state(false);

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

	// Assignee popover state (fixed position like priority popover)
	let assigneePopover: { tcId: number; x: number; y: number } | null = $state(null);

	// Component references
	let detailSheet: TestCaseDetailSheet;
	let failureSheet: FailureDetailsSheet;
	let failDialog: FailWithDetailDialog;

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
			params.delete('page');
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
		newStatus: string,
		tcKey?: string
	) {
		if (newStatus === 'FAIL') {
			openDropdown = null;
			failDialog.open(runId, executionId, tcKey ?? '');
			return;
		}
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
		if (assigneePopover && !target.closest('[data-assignee-popover]')) {
			assigneePopover = null;
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

	const VIRTUAL_SCROLL_THRESHOLD = 200;
	const useVirtualScroll = $derived(data.testCases.length > VIRTUAL_SCROLL_THRESHOLD);
	const dndDisabled = $derived(hasActiveFilters || !canEdit || useVirtualScroll);

	type FlatItem =
		| { _type: 'group-header'; group: GroupItem }
		| { _type: 'tc'; tc: TcItem }
		| { _type: 'quick-create'; groupKey: number }
		| { _type: 'uncat-header' };

	const flatItems: FlatItem[] = $derived.by(() => {
		const items: FlatItem[] = [];
		for (const group of dndGroups) {
			items.push({ _type: 'group-header', group });
			if (!collapsedGroups.has(group.id)) {
				for (const tc of group.items) {
					items.push({ _type: 'tc', tc });
				}
				if (canEdit) {
					items.push({ _type: 'quick-create', groupKey: group.id });
				}
			}
		}
		items.push({ _type: 'uncat-header' });
		if (!collapsedGroups.has(-1)) {
			for (const tc of dndUncategorized) {
				items.push({ _type: 'tc', tc });
			}
			if (canEdit) {
				items.push({ _type: 'quick-create', groupKey: -1 });
			}
		}
		return items;
	});

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
			toast.error(m.error_update_failed());
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
			toast.error(m.error_update_failed());
		}
	}

	const priorityOptions = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

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
		if (!tc) return;
		const isAssigned = tc.assignees?.some((a) => a.userId === userId);
		const action = isAssigned ? 'removeAssignee' : 'assignAssignee';
		const formData = new FormData();
		formData.set('userId', userId);
		try {
			const res = await fetch(
				`/projects/${data.project.id}/test-cases/${tcId}?/${action}`,
				{ method: 'POST', body: formData }
			);
			if (res.ok) {
				await invalidateAll();
			} else {
				toast.error(m.error_operation_failed());
			}
		} catch {
			toast.error(m.error_operation_failed());
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
			toast.error(m.error_operation_failed());
		} finally {
			bulkLoading = false;
			bulkDeleteOpen = false;
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
			toast.error(m.error_operation_failed());
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
			toast.error(m.error_update_failed());
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
				toast.error(m.error_delete_failed());
			}
		} catch {
			toast.error(m.error_delete_failed());
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
				toast.error(m.error_operation_failed());
				await invalidateAll();
			}
		} catch {
			toast.error(m.error_operation_failed());
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
				toast.error(m.error_operation_failed());
				await invalidateAll();
			}
		} catch {
			toast.error(m.error_operation_failed());
			await invalidateAll();
		}
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="space-y-4" onclick={handleClickOutside} onkeydown={(e) => { if (e.key === 'Escape') { openDropdown = null; editingCell = null; priorityPopover = null; assigneePopover = null; } }}>
	<div class="flex items-center justify-between">
		<h2 class="text-lg font-semibold">{m.tc_title()}</h2>
		<div class="flex items-center gap-2">
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					<Button variant="outline" size="sm">{m.tc_export()}</Button>
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

	<div class="flex flex-wrap items-center gap-2">
		<Input
			placeholder={m.tc_search_placeholder()}
			class="h-7 max-w-xs text-xs"
			bind:value={searchInput}
			oninput={handleSearch}
			aria-label={m.tc_search_placeholder()}
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
			{#if canEdit}
				<button
					type="button"
					data-assignee-popover
					class="w-24 shrink-0 flex gap-0.5 overflow-hidden items-center cursor-pointer rounded hover:bg-muted/50 transition-colors px-0.5 -mx-0.5"
					onclick={(e) => { e.stopPropagation(); openAssigneePopover(tc.id, e); }}
				>
					{#if tc.assignees && tc.assignees.length > 0}
						{#each tc.assignees.slice(0, 2) as a (a.userId)}
							<Badge variant="outline" class="text-[10px] px-1.5 py-0 truncate">{a.userName}</Badge>
						{/each}
						{#if tc.assignees.length > 2}
							<span class="text-[10px] text-muted-foreground">+{tc.assignees.length - 2}</span>
						{/if}
					{:else}
						<span class="text-[10px] text-muted-foreground/50 hover:text-primary transition-colors">+</span>
					{/if}
				</button>
			{:else}
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
			{/if}
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

			{#if useVirtualScroll}
				<!-- Virtual scroll mode -->
				<VirtualList items={flatItems} rowHeight={32} height="calc(100vh - 300px)">
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
								class="flex items-center gap-2 px-3 py-1.5 border-b hover:bg-muted/30 cursor-pointer group/row text-xs"
								onclick={() => detailSheet.open(row.tc.id)}
								role="button"
								tabindex="0"
								onkeydown={(e) => { if (e.key === 'Enter') detailSheet.open(row.tc.id); }}
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
								<span class="text-xs text-muted-foreground font-normal">({dndUncategorized.length})</span>
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
											onclick={() => detailSheet.open(tc.id)}
											role="button"
											tabindex="0"
											onkeydown={(e) => { if (e.key === 'Enter') detailSheet.open(tc.id); }}
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
									onclick={() => detailSheet.open(tc.id)}
									role="button"
									tabindex="0"
									onkeydown={(e) => { if (e.key === 'Enter') detailSheet.open(tc.id); }}
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
						class="block w-full px-3 py-1.5 text-left text-xs hover:bg-muted {statusColor(s)} {s === exec.status ? 'font-bold' : ''}"
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
			</div>
		{/if}
	{/if}

	<!-- Fixed-position assignee popover -->
	{#if assigneePopover}
		{@const tcForPopover = data.testCases.find((tc) => tc.id === assigneePopover!.tcId)}
		<div
			data-assignee-popover
			class="fixed z-[9999] bg-popover border rounded-md shadow-lg py-1 min-w-[150px] max-h-[240px] overflow-y-auto"
			style="left: {assigneePopover.x}px; top: {assigneePopover.y}px; transform: translateX(-50%);"
		>
			{#each data.projectMembers as member (member.userId)}
				{@const isAssigned = tcForPopover?.assignees?.some((a) => a.userId === member.userId) ?? false}
				<button
					type="button"
					class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-muted transition-colors {isAssigned ? 'font-bold bg-muted/50' : ''}"
					onclick={() => toggleAssignee(assigneePopover!.tcId, member.userId)}
				>
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

	{#if data.testCases.length > 0}
		<span class="text-muted-foreground text-xs">
			{m.common_total_count({ count: data.testCases.length })}
		</span>
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
