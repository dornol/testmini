<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import AttachmentManager from '$lib/components/AttachmentManager.svelte';
	import * as m from '$lib/paraglide/messages.js';

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
		exec: Execution;
		failures: FailureRecord[];
		canExecute: boolean;
		showCheckbox: boolean;
		isSelected: boolean;
		viewFailuresExecId: number | null;
		onToggleSelect: (id: number) => void;
		onToggleStatusDropdown: (exec: Execution, event: MouseEvent) => void;
		onToggleViewFailures: (execId: number) => void;
		onOpenFailDialog: (execId: number, key: string) => void;
		onOpenEditFailure: (f: FailureRecord) => void;
		onOpenDeleteFailure: (id: number) => void;
		measureHeight: (node: HTMLElement, params: { execId: number }) => { destroy(): void };
	}

	let {
		exec,
		failures,
		canExecute,
		showCheckbox,
		isSelected,
		viewFailuresExecId,
		onToggleSelect,
		onToggleStatusDropdown,
		onToggleViewFailures,
		onOpenFailDialog,
		onOpenEditFailure,
		onOpenDeleteFailure,
		measureHeight
	}: Props = $props();

	const showFailureDetails = $derived(exec.status === 'FAIL' && viewFailuresExecId === exec.id);

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

<tr class="hover:bg-muted/50 border-b transition-colors">
	{#if showCheckbox}
		<td class="bg-clip-padding p-2 align-middle whitespace-nowrap">
			{#if exec.status === 'PENDING'}
				<input
					type="checkbox"
					checked={isSelected}
					onchange={() => onToggleSelect(exec.id)}
					class="rounded"
				/>
			{/if}
		</td>
	{/if}
	<td class="bg-clip-padding p-2 align-middle whitespace-nowrap font-mono text-sm"
		>{exec.testCaseKey}</td
	>
	<td class="bg-clip-padding p-2 align-middle whitespace-nowrap font-medium">
		{exec.testCaseTitle}
		<span class="text-muted-foreground text-xs"> (v{exec.versionNo})</span>
	</td>
	<td class="bg-clip-padding p-2 align-middle whitespace-nowrap">
		<Badge variant={priorityVariant(exec.testCasePriority)}>
			{exec.testCasePriority}
		</Badge>
	</td>
	<td class="bg-clip-padding p-2 align-middle whitespace-nowrap">
		{#if canExecute}
			<button
				type="button"
				data-status-dropdown
				class="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium cursor-pointer hover:ring-1 hover:ring-ring/30 transition-all {statusColor(exec.status)}"
				class:underline={exec.status === 'FAIL' && failures.length > 0}
				onclick={(e) => onToggleStatusDropdown(exec, e)}
			>
				{exec.status}
				{#if exec.status === 'FAIL' && failures.length > 0}
					({failures.length})
				{/if}
			</button>
		{:else}
			<button
				type="button"
				class="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium {statusColor(exec.status)}"
				onclick={() => {
					if (exec.status === 'FAIL') {
						onToggleViewFailures(exec.id);
					}
				}}
				class:cursor-pointer={exec.status === 'FAIL'}
				class:underline={exec.status === 'FAIL' && failures.length > 0}
			>
				{exec.status}
				{#if exec.status === 'FAIL' && failures.length > 0}
					({failures.length})
				{/if}
			</button>
		{/if}
	</td>
	<td class="text-muted-foreground bg-clip-padding p-2 align-middle whitespace-nowrap text-sm">
		{exec.executedBy ?? '-'}
	</td>
</tr>

<!-- Inline failure details -->
{#if showFailureDetails}
	<tr>
		<td colspan="99">
			<div
				use:measureHeight={{ execId: exec.id }}
				class="bg-red-50 dark:bg-red-950/30 space-y-3 rounded-md p-4"
			>
				<div class="flex items-center justify-between">
					<h4 class="text-sm font-medium text-red-800 dark:text-red-300">
						{m.fail_details()}
					</h4>
					{#if canExecute}
						<Button
							type="button"
							variant="outline"
							size="sm"
							onclick={() => onOpenFailDialog(exec.id, exec.testCaseKey)}
						>
							{m.fail_add_detail()}
						</Button>
					{/if}
				</div>
				<div class="mb-3 border-b pb-3">
					<AttachmentManager
						referenceType="EXECUTION"
						referenceId={exec.id}
						editable={canExecute}
					/>
				</div>
				{#if failures.length === 0}
					<p class="text-muted-foreground text-sm">
						{m.fail_no_details()}
					</p>
				{:else}
					{#each failures as f (f.id)}
						<div class="rounded border bg-white p-3 dark:bg-gray-900">
							<div class="flex items-start justify-between">
								<div class="space-y-1 text-sm">
									{#if f.errorMessage}
										<div>
											<span class="font-medium">{m.fail_error()}:</span>
											{f.errorMessage}
										</div>
									{/if}
									{#if f.testMethod}
										<div>
											<span class="font-medium">{m.fail_method()}:</span>
											{f.testMethod}
										</div>
									{/if}
									{#if f.failureEnvironment}
										<div>
											<span class="font-medium">{m.common_environment()}:</span>
											{f.failureEnvironment}
										</div>
									{/if}
									{#if f.stackTrace}
										<details class="mt-2">
											<summary class="text-muted-foreground cursor-pointer text-xs"
												>{m.fail_stack_trace()}</summary
											>
											<pre
												class="bg-muted mt-1 overflow-x-auto rounded p-2 text-xs">{f.stackTrace}</pre>
										</details>
									{/if}
									{#if f.comment}
										<div class="text-muted-foreground mt-1">
											{f.comment}
										</div>
									{/if}
								</div>
								{#if canExecute}
									<div class="flex gap-1">
										<Button
											type="button"
											variant="ghost"
											size="sm"
											class="h-7 px-2 text-xs"
											onclick={() => onOpenEditFailure(f)}
										>
											{m.common_edit()}
										</Button>
										<Button
											type="button"
											variant="ghost"
											size="sm"
											class="text-destructive hover:text-destructive h-7 px-2 text-xs"
											onclick={() => onOpenDeleteFailure(f.id)}
										>
											{m.common_delete()}
										</Button>
									</div>
								{/if}
							</div>
							<div class="text-muted-foreground mt-2 text-xs">
								{f.createdBy} &middot; {new Date(f.createdAt).toLocaleString()}
							</div>
							<div class="mt-3 border-t pt-3">
								<AttachmentManager
									referenceType="FAILURE"
									referenceId={f.id}
									editable={canExecute}
								/>
							</div>
						</div>
					{/each}
				{/if}
			</div>
		</td>
	</tr>
{/if}
