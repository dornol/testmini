<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { tick } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { toast } from 'svelte-sonner';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as m from '$lib/paraglide/messages.js';
	import ExecutionRow from './ExecutionRow.svelte';

	interface FailureRecord {
		id: number;
		testExecutionId: number;
		failureEnvironment: string | null;
		testMethod: string | null;
		errorMessage: string | null;
		stackTrace: string | null;
		comment: string | null;
		createdBy: string | null;
		createdAt: Date;
	}

	interface Execution {
		id: number;
		status: string;
		testCaseKey: string;
		testCaseTitle: string;
		testCasePriority: string;
		versionNo: number;
		executedBy: string | null;
	}

	interface Props {
		executions: Execution[];
		failures: FailureRecord[];
		canExecute: boolean;
		selectedPending: Set<number>;
		allPendingSelected: boolean;
		pendingExecutions: Execution[];
		onTogglePendingAll: () => void;
		onTogglePending: (id: number) => void;
		onOpenFailDialog: (execId: number, key: string) => void;
		onOpenEditFailure: (f: FailureRecord) => void;
		onOpenDeleteFailure: (id: number) => void;
		onScrollContainerBind: (el: HTMLDivElement) => void;
	}

	let {
		executions,
		failures,
		canExecute,
		selectedPending,
		allPendingSelected,
		pendingExecutions,
		onTogglePendingAll,
		onTogglePending,
		onOpenFailDialog,
		onOpenEditFailure,
		onOpenDeleteFailure,
		onScrollContainerBind
	}: Props = $props();

	// Virtual scroll constants & state
	const ROW_HEIGHT = 44;
	const OVERSCAN = 10;

	let scrollContainer = $state<HTMLDivElement | undefined>(undefined);
	let scrollTop = $state(0);
	let viewportHeight = $state(0);
	let expandedHeights = new SvelteMap<number, number>();

	// Status dropdown state
	let statusDropdown = $state<{
		execId: number;
		currentStatus: string;
		x: number;
		y: number;
		tcKey: string;
	} | null>(null);

	const allStatuses = ['PENDING', 'PASS', 'FAIL', 'BLOCKED', 'SKIPPED'];

	let viewFailuresExecId = $state<number | null>(null);
	let updatingExecId = $state<number | null>(null);

	// Pass scroll container ref to parent via callback
	function setupScrollContainer(node: HTMLDivElement) {
		scrollContainer = node;
		onScrollContainerBind(node);

		const ro = new ResizeObserver((entries) => {
			viewportHeight = entries[0].contentRect.height;
		});
		ro.observe(node);

		return {
			destroy() {
				ro.disconnect();
			}
		};
	}

	// Cumulative offset array for variable-height rows
	const rowOffsets = $derived.by(() => {
		const offsets = [0];
		for (let i = 0; i < executions.length; i++) {
			const exec = executions[i];
			let h = ROW_HEIGHT;
			if (exec.status === 'FAIL' && viewFailuresExecId === exec.id) {
				h += expandedHeights.get(exec.id) ?? 300;
			}
			offsets.push(offsets[i] + h);
		}
		return offsets;
	});

	const totalHeight = $derived(rowOffsets[executions.length] ?? 0);

	// Binary search to find first row at or after a given offset
	function findRowIndex(offsets: number[], target: number): number {
		let lo = 0;
		let hi = offsets.length - 1;
		while (lo < hi) {
			const mid = (lo + hi) >>> 1;
			if (offsets[mid] < target) lo = mid + 1;
			else hi = mid;
		}
		return lo;
	}

	const startIndex = $derived(Math.max(0, findRowIndex(rowOffsets, scrollTop) - OVERSCAN));
	const endIndex = $derived(
		Math.min(executions.length, findRowIndex(rowOffsets, scrollTop + viewportHeight) + OVERSCAN)
	);
	const visibleExecutions = $derived(executions.slice(startIndex, endIndex));
	const topSpacerHeight = $derived(rowOffsets[startIndex] ?? 0);
	const bottomSpacerHeight = $derived(totalHeight - (rowOffsets[endIndex] ?? totalHeight));

	function handleScroll(e: Event) {
		const target = e.currentTarget as HTMLDivElement;
		scrollTop = target.scrollTop;
		viewportHeight = target.clientHeight;
	}

	// Measure expanded failure detail height — used as a Svelte action
	function measureHeight(node: HTMLElement, params: { execId: number }) {
		const observer = new ResizeObserver((entries) => {
			const h = entries[0].contentRect.height;
			if (h > 0 && expandedHeights.get(params.execId) !== h) {
				expandedHeights.set(params.execId, h);
			}
		});
		observer.observe(node);
		return {
			destroy() {
				observer.disconnect();
			}
		};
	}

	function getFailures(executionId: number) {
		return failures.filter((f) => f.testExecutionId === executionId);
	}

	function statusColor(s: string): string {
		switch (s) {
			case 'PASS':
				return 'text-green-600 bg-green-50 dark:bg-green-950 dark:text-green-400';
			case 'FAIL':
				return 'text-red-600 bg-red-50 dark:bg-red-950 dark:text-red-400';
			case 'BLOCKED':
				return 'text-orange-600 bg-orange-50 dark:bg-orange-950 dark:text-orange-400';
			case 'SKIPPED':
				return 'text-gray-600 bg-gray-50 dark:bg-gray-800 dark:text-gray-400';
			default:
				return 'text-muted-foreground';
		}
	}

	function toggleStatusDropdown(exec: Execution, event: MouseEvent) {
		event.stopPropagation();
		if (statusDropdown?.execId === exec.id) {
			statusDropdown = null;
		} else {
			const el = event.currentTarget as HTMLElement;
			const rect = el.getBoundingClientRect();
			statusDropdown = {
				execId: exec.id,
				currentStatus: exec.status,
				x: rect.left + rect.width / 2,
				y: rect.bottom + 4,
				tcKey: exec.testCaseKey
			};
		}
	}

	async function changeExecutionStatus(execId: number, newStatus: string, tcKey: string) {
		if (newStatus === 'FAIL') {
			statusDropdown = null;
			onOpenFailDialog(execId, tcKey);
			return;
		}
		statusDropdown = null;
		updatingExecId = execId;
		const formData = new FormData();
		formData.set('executionId', String(execId));
		formData.set('status', newStatus);
		try {
			const res = await fetch(`?/updateStatus`, { method: 'POST', body: formData });
			if (res.ok) {
				const savedScroll = scrollContainer?.scrollTop ?? 0;
				await invalidateAll();
				await tick();
				if (scrollContainer) scrollContainer.scrollTop = savedScroll;
			} else {
				toast.error(m.error_operation_failed());
			}
		} catch {
			toast.error(m.error_operation_failed());
		} finally {
			updatingExecId = null;
		}
	}

	function handleToggleViewFailures(execId: number) {
		if (viewFailuresExecId === execId) {
			expandedHeights.delete(execId);
			viewFailuresExecId = null;
		} else {
			viewFailuresExecId = execId;
		}
	}

	function handleDropdownKeydown(event: KeyboardEvent) {
		if (!statusDropdown) return;
		const items = Array.from(
			document.querySelectorAll<HTMLButtonElement>('[data-status-dropdown] button')
		);
		const current = document.activeElement as HTMLElement;
		const idx = items.indexOf(current as HTMLButtonElement);

		if (event.key === 'Escape') {
			event.preventDefault();
			statusDropdown = null;
		} else if (event.key === 'ArrowDown') {
			event.preventDefault();
			const next = idx < items.length - 1 ? idx + 1 : 0;
			items[next]?.focus();
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			const prev = idx > 0 ? idx - 1 : items.length - 1;
			items[prev]?.focus();
		}
	}

	// Auto-focus first item when dropdown opens
	$effect(() => {
		if (statusDropdown) {
			tick().then(() => {
				const first = document.querySelector<HTMLButtonElement>('[data-status-dropdown] button');
				first?.focus();
			});
		}
	});

	export function closeStatusDropdown() {
		statusDropdown = null;
	}

	export function getScrollContainer() {
		return scrollContainer;
	}
</script>

<!-- Executions Table with Virtual Scroll -->
<Card.Root>
	<div
		use:setupScrollContainer
		class="overflow-y-auto"
		style="max-height: calc(100vh - 340px);"
		onscroll={handleScroll}
	>
		<table class="w-full caption-bottom text-sm">
			<thead class="sticky top-0 z-10 bg-background [&_tr]:border-b">
				<tr>
					{#if canExecute && pendingExecutions.length > 0}
						<th
							class="text-foreground h-10 w-10 bg-clip-padding px-2 text-start align-middle font-medium whitespace-nowrap"
						>
							<input
								type="checkbox"
								checked={allPendingSelected}
								onchange={onTogglePendingAll}
								class="rounded"
							/>
						</th>
					{/if}
					<th
						class="text-foreground h-10 w-28 bg-clip-padding px-2 text-start align-middle font-medium whitespace-nowrap"
						>{m.common_key()}</th
					>
					<th
						class="text-foreground h-10 bg-clip-padding px-2 text-start align-middle font-medium whitespace-nowrap"
						>{m.common_title()}</th
					>
					<th
						class="text-foreground h-10 w-24 bg-clip-padding px-2 text-start align-middle font-medium whitespace-nowrap"
						>{m.common_priority()}</th
					>
					<th
						class="text-foreground h-10 w-28 bg-clip-padding px-2 text-start align-middle font-medium whitespace-nowrap"
						>{m.common_status()}</th
					>
					<th
						class="text-foreground h-10 w-32 bg-clip-padding px-2 text-start align-middle font-medium whitespace-nowrap"
						>{m.run_executed_by()}</th
					>
				</tr>
			</thead>
			<tbody class="[&_tr:last-child]:border-0">
				<tr style="height: {topSpacerHeight}px"><td colspan="99"></td></tr>
				{#each visibleExecutions as exec (exec.id)}
					<ExecutionRow
						{exec}
						failures={getFailures(exec.id)}
						{canExecute}
						showCheckbox={canExecute && pendingExecutions.length > 0}
						isSelected={selectedPending.has(exec.id)}
						isUpdating={updatingExecId === exec.id}
						{viewFailuresExecId}
						onToggleSelect={onTogglePending}
						onToggleStatusDropdown={toggleStatusDropdown}
						onToggleViewFailures={handleToggleViewFailures}
						{onOpenFailDialog}
						{onOpenEditFailure}
						{onOpenDeleteFailure}
						{measureHeight}
					/>
				{/each}
				<tr style="height: {bottomSpacerHeight}px"><td colspan="99"></td></tr>
			</tbody>
		</table>
	</div>
</Card.Root>

<!-- Fixed-position status dropdown -->
{#if statusDropdown}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		data-status-dropdown
		role="menu"
		aria-label="Status options"
		class="fixed z-[9999] bg-popover border rounded-md shadow-lg py-1 min-w-[120px]"
		style="left: {statusDropdown.x}px; top: {statusDropdown.y}px; transform: translateX(-50%);"
		onkeydown={handleDropdownKeydown}
	>
		{#each allStatuses as s (s)}
			<button
				type="button"
				role="menuitem"
				class="block w-full px-3 py-1.5 text-left text-xs hover:bg-muted {statusColor(s)} {s === statusDropdown.currentStatus ? 'font-bold bg-muted/50' : ''}"
				onclick={() => changeExecutionStatus(statusDropdown!.execId, s, statusDropdown!.tcKey)}
			>
				{s}
				{#if s === statusDropdown.currentStatus}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="12"
						height="12"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2.5"
						stroke-linecap="round"
						stroke-linejoin="round"
						class="inline ml-1"
						><polyline points="20 6 9 17 4 12" /></svg
					>
				{/if}
			</button>
		{/each}
		{#if statusDropdown.currentStatus === 'FAIL'}
			<div class="border-t my-1"></div>
			<button
				type="button"
				class="block w-full px-3 py-1.5 text-left text-xs hover:bg-muted text-muted-foreground"
				onclick={() => {
					const execId = statusDropdown!.execId;
					handleToggleViewFailures(execId);
					statusDropdown = null;
				}}
			>
				{m.fail_details()}
			</button>
		{/if}
	</div>
{/if}
