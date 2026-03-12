<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { toast } from 'svelte-sonner';
	import { apiPost, apiFetch } from '$lib/api-client';
	import * as m from '$lib/paraglide/messages.js';

	export interface ApprovalHistoryEntry {
		id: number;
		fromStatus: string;
		toStatus: string;
		userId: string;
		userName: string;
		comment: string | null;
		createdAt: string;
	}

	interface Props {
		projectId: number;
		testCaseId: number;
		initialApprovalStatus: string;
		userRole: string;
		canEdit: boolean;
		editing: boolean;
	}

	let { projectId, testCaseId, initialApprovalStatus, userRole, canEdit, editing }: Props = $props();

	let approvalStatus = $state('DRAFT');
	let approvalHistory = $state<ApprovalHistoryEntry[]>([]);
	let approvalLoading = $state(false);
	let rejectDialogOpen = $state(false);
	let rejectComment = $state('');

	$effect(() => {
		approvalStatus = initialApprovalStatus ?? 'DRAFT';
	});

	$effect(() => {
		const tcId = testCaseId;
		const projId = projectId;
		apiFetch<{ approvalStatus: string; history: ApprovalHistoryEntry[] }>(
			`/api/projects/${projId}/test-cases/${tcId}/approval`
		).then((result) => {
			approvalStatus = result.approvalStatus;
			approvalHistory = result.history;
		}).catch(() => {});
	});

	async function handleApprovalAction(action: string, comment?: string) {
		approvalLoading = true;
		try {
			const result = await apiPost<{ approvalStatus: string }>(
				`/api/projects/${projectId}/test-cases/${testCaseId}/approval`,
				{ action, comment }
			);
			approvalStatus = result.approvalStatus;
			const refreshed = await apiFetch<{ history: ApprovalHistoryEntry[] }>(
				`/api/projects/${projectId}/test-cases/${testCaseId}/approval`
			);
			approvalHistory = refreshed.history;
			if (action === 'submit_review') toast.success(m.approval_submitted());
			else if (action === 'approve') toast.success(m.approval_approved_toast());
			else if (action === 'reject') toast.success(m.approval_rejected_toast());
			else if (action === 'revert_draft') toast.success(m.approval_reverted());
		} catch {
			toast.error(m.approval_error());
		} finally {
			approvalLoading = false;
			rejectDialogOpen = false;
			rejectComment = '';
		}
	}

	function getApprovalBadgeClass(status: string): string {
		switch (status) {
			case 'IN_REVIEW': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
			case 'APPROVED': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
			case 'REJECTED': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
			default: return 'bg-muted text-muted-foreground';
		}
	}

	function getApprovalLabel(status: string): string {
		switch (status) {
			case 'DRAFT': return m.approval_draft();
			case 'IN_REVIEW': return m.approval_in_review();
			case 'APPROVED': return m.approval_approved();
			case 'REJECTED': return m.approval_rejected();
			default: return status;
		}
	}

	const canApproveReject = $derived(userRole === 'PROJECT_ADMIN' || userRole === 'QA');
	const latestRejection = $derived(
		approvalStatus === 'REJECTED'
			? approvalHistory.find((h) => h.toStatus === 'REJECTED')
			: null
	);
</script>

<!-- Status + Actions row -->
<div class="flex items-center gap-2 flex-wrap">
	<span class="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium {getApprovalBadgeClass(approvalStatus)}">
		{getApprovalLabel(approvalStatus)}
	</span>
	{#if canEdit && !editing}
		{#if approvalStatus === 'DRAFT'}
			<Button variant="outline" size="sm" disabled={approvalLoading} onclick={() => handleApprovalAction('submit_review')}>
				{m.approval_submit_review()}
			</Button>
		{:else if approvalStatus === 'IN_REVIEW' && canApproveReject}
			<Button variant="outline" size="sm" class="text-green-700 border-green-300 hover:bg-green-50 dark:text-green-400 dark:border-green-700 dark:hover:bg-green-950" disabled={approvalLoading} onclick={() => handleApprovalAction('approve')}>
				{m.approval_approve()}
			</Button>
			<Button variant="outline" size="sm" class="text-red-700 border-red-300 hover:bg-red-50 dark:text-red-400 dark:border-red-700 dark:hover:bg-red-950" disabled={approvalLoading} onclick={() => (rejectDialogOpen = true)}>
				{m.approval_reject()}
			</Button>
		{:else if approvalStatus === 'APPROVED' || approvalStatus === 'REJECTED'}
			<Button variant="outline" size="sm" disabled={approvalLoading} onclick={() => handleApprovalAction('revert_draft')}>
				{m.approval_revert_draft()}
			</Button>
		{/if}
	{/if}
</div>
{#if latestRejection?.comment}
	<p class="mt-1 text-xs text-red-600 dark:text-red-400 italic">
		{m.approval_reject()}: "{latestRejection.comment}" &mdash; {latestRejection.userName}
	</p>
{/if}

<!-- Approval History -->
{#if approvalHistory.length > 0}
	<Card.Root>
		<Card.Header>
			<Card.Title class="text-base">{m.approval_history_title()}</Card.Title>
		</Card.Header>
		<Card.Content>
			<div class="relative pl-4 space-y-4">
				<div class="absolute left-1.5 top-1 bottom-1 w-px bg-border"></div>
				{#each approvalHistory as entry (entry.id)}
					<div class="relative">
						<div class="absolute -left-4 top-1 h-3 w-3 rounded-full border-2 border-background {entry.toStatus === 'APPROVED' ? 'bg-green-500' : entry.toStatus === 'REJECTED' ? 'bg-red-500' : entry.toStatus === 'IN_REVIEW' ? 'bg-yellow-500' : 'bg-muted-foreground'}"></div>
						<div class="text-sm">
							<span class="font-medium">{entry.userName}</span>
							<span class="text-muted-foreground">
								{getApprovalLabel(entry.fromStatus)} &rarr; {getApprovalLabel(entry.toStatus)}
							</span>
						</div>
						{#if entry.comment}
							<p class="text-sm text-muted-foreground mt-0.5 italic">"{entry.comment}"</p>
						{/if}
						<p class="text-xs text-muted-foreground mt-0.5">
							{new Date(entry.createdAt).toLocaleString()}
						</p>
					</div>
				{/each}
			</div>
		</Card.Content>
	</Card.Root>
{/if}

<!-- Reject Dialog -->
<AlertDialog.Root bind:open={rejectDialogOpen}>
	<AlertDialog.Portal>
		<AlertDialog.Overlay />
		<AlertDialog.Content>
			<AlertDialog.Header>
				<AlertDialog.Title>{m.approval_reject_title()}</AlertDialog.Title>
				<AlertDialog.Description>
					{m.approval_reject_desc()}
				</AlertDialog.Description>
			</AlertDialog.Header>
			<div class="py-4">
				<Textarea
					placeholder={m.approval_reject_comment_placeholder()}
					bind:value={rejectComment}
					rows={3}
				/>
			</div>
			<AlertDialog.Footer>
				<AlertDialog.Cancel onclick={() => { rejectComment = ''; }}>{m.common_cancel()}</AlertDialog.Cancel>
				<Button
					variant="destructive"
					disabled={approvalLoading || !rejectComment.trim()}
					onclick={() => handleApprovalAction('reject', rejectComment)}
				>
					{m.approval_reject()}
				</Button>
			</AlertDialog.Footer>
		</AlertDialog.Content>
	</AlertDialog.Portal>
</AlertDialog.Root>
