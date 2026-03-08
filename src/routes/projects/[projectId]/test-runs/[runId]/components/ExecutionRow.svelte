<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import PriorityBadge from '$lib/components/PriorityBadge.svelte';
	import AttachmentManager from '$lib/components/AttachmentManager.svelte';
	import CommentSection from '$lib/components/CommentSection.svelte';
	import { toast } from 'svelte-sonner';
	import { apiPost, apiDelete } from '$lib/api-client';
	import * as m from '$lib/paraglide/messages.js';

	interface IssueLinkRecord {
		id: number;
		externalUrl: string;
		issueKey: string | null;
		title: string | null;
		status: string | null;
	}

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
		execIssueLinks?: IssueLinkRecord[];
		hasIssueTracker?: boolean;
		testCaseId?: number;
		canExecute: boolean;
		showCheckbox: boolean;
		isSelected: boolean;
		isUpdating?: boolean;
		priorityColor: string;
		viewFailuresExecId: number | null;
		commentOpenExecId: number | null;
		projectId: number;
		runId: number;
		currentUserId: string;
		userRole: string;
		onToggleSelect: (id: number) => void;
		onToggleStatusDropdown: (exec: Execution, event: MouseEvent) => void;
		onToggleViewFailures: (execId: number) => void;
		onToggleComments: (execId: number) => void;
		onOpenFailDialog: (execId: number, key: string) => void;
		onOpenEditFailure: (f: FailureRecord) => void;
		onOpenDeleteFailure: (id: number) => void;
		measureHeight: (node: HTMLElement, params: { execId: number }) => { destroy(): void };
	}

	let {
		exec,
		failures,
		execIssueLinks = [],
		hasIssueTracker = false,
		testCaseId,
		canExecute,
		showCheckbox,
		isSelected,
		isUpdating = false,
		priorityColor,
		viewFailuresExecId,
		commentOpenExecId,
		projectId,
		runId,
		currentUserId,
		userRole,
		onToggleSelect,
		onToggleStatusDropdown,
		onToggleViewFailures,
		onToggleComments,
		onOpenFailDialog,
		onOpenEditFailure,
		onOpenDeleteFailure,
		measureHeight
	}: Props = $props();

	let issueLinks = $state<IssueLinkRecord[]>(execIssueLinks);
	let showIssueLinkForm = $state(false);
	let newIssueLinkUrl = $state('');
	let linkingIssue = $state(false);

	async function handleLinkIssue() {
		if (linkingIssue || !newIssueLinkUrl.trim() || !testCaseId) return;
		linkingIssue = true;
		try {
			const created = await apiPost<IssueLinkRecord>(
				`/api/projects/${projectId}/test-cases/${testCaseId}/issue-links`,
				{ externalUrl: newIssueLinkUrl.trim(), executionId: exec.id }
			);
			issueLinks = [created, ...issueLinks];
			newIssueLinkUrl = '';
			showIssueLinkForm = false;
			toast.success(m.issue_link_linked());
		} catch {
			// handled
		} finally {
			linkingIssue = false;
		}
	}

	async function handleRemoveExecIssueLink(id: number) {
		if (!testCaseId) return;
		try {
			await apiDelete(`/api/projects/${projectId}/test-cases/${testCaseId}/issue-links/${id}`);
			issueLinks = issueLinks.filter((l) => l.id !== id);
			toast.success(m.issue_link_removed());
		} catch {
			// handled
		}
	}

	const showFailureDetails = $derived(exec.status === 'FAIL' && viewFailuresExecId === exec.id);
	const showComments = $derived(commentOpenExecId === exec.id);

	const commentUrl = $derived(
		`/api/projects/${projectId}/test-runs/${runId}/executions/${exec.id}/comments`
	);

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
		<PriorityBadge name={exec.testCasePriority} color={priorityColor} />
	</td>
	<td class="bg-clip-padding p-2 align-middle whitespace-nowrap">
		{#if canExecute}
			<button
				type="button"
				data-status-dropdown
				class="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium cursor-pointer hover:ring-1 hover:ring-ring/30 transition-all {statusColor(exec.status)}"
				class:underline={exec.status === 'FAIL' && failures.length > 0}
				class:opacity-50={isUpdating}
				disabled={isUpdating}
				onclick={(e) => onToggleStatusDropdown(exec, e)}
			>
				{#if isUpdating}
					<svg class="h-3 w-3 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
				{/if}
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
	<td class="bg-clip-padding p-1 align-middle whitespace-nowrap">
		<button
			type="button"
			class="inline-flex items-center justify-center rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
			class:text-primary={showComments}
			title={m.exec_comment_title()}
			onclick={() => onToggleComments(exec.id)}
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="16"
				height="16"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
			</svg>
		</button>
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
				<!-- Issue Links for this execution -->
				{#if issueLinks.length > 0 || canExecute}
					<div class="border-t pt-3 mt-3">
						<div class="flex items-center justify-between mb-2">
							<h5 class="text-xs font-medium text-red-800 dark:text-red-300">{m.issue_link_title()}</h5>
							{#if canExecute}
								<Button
									type="button"
									variant="outline"
									size="sm"
									class="h-6 text-xs"
									onclick={() => (showIssueLinkForm = !showIssueLinkForm)}
								>
									{m.issue_link_add()}
								</Button>
							{/if}
						</div>
						{#if showIssueLinkForm}
							<form
								onsubmit={(e) => {
									e.preventDefault();
									handleLinkIssue();
								}}
								class="flex gap-2 mb-2"
							>
								<Input
									placeholder={m.issue_link_url_placeholder()}
									type="url"
									bind:value={newIssueLinkUrl}
									required
									class="h-7 text-xs flex-1"
								/>
								<Button type="submit" size="sm" class="h-7 text-xs" disabled={linkingIssue || !newIssueLinkUrl.trim()}>
									{linkingIssue ? m.common_loading() : m.issue_link_add()}
								</Button>
							</form>
						{/if}
						{#each issueLinks as link (link.id)}
							<div class="flex items-center justify-between gap-2 text-xs py-1">
								<div class="flex items-center gap-2 min-w-0">
									{#if link.issueKey}
										<span class="font-mono font-medium">{link.issueKey}</span>
									{/if}
									<a
										href={link.externalUrl}
										target="_blank"
										rel="noopener noreferrer"
										class="text-primary hover:underline truncate"
									>
										{link.title || link.externalUrl}
									</a>
									{#if link.status}
										<span class="rounded-full border px-1.5 py-0.5 text-[10px]">{link.status}</span>
									{/if}
								</div>
								{#if canExecute}
									<button
										type="button"
										class="text-destructive hover:text-destructive/80 shrink-0"
										onclick={() => handleRemoveExecIssueLink(link.id)}
									>
										&times;
									</button>
								{/if}
							</div>
						{/each}
					</div>
				{/if}

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

<!-- Inline execution comments -->
{#if showComments}
	<tr>
		<td colspan="99">
			<div
				use:measureHeight={{ execId: -exec.id }}
				class="p-4"
			>
				<CommentSection
					{currentUserId}
					{userRole}
					{commentUrl}
				/>
			</div>
		</td>
	</tr>
{/if}
