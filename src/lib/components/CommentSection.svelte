<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { apiFetch, apiPost, apiPatch, apiDelete } from '$lib/api-client';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import * as m from '$lib/paraglide/messages.js';
	import CommentItem from './CommentItem.svelte';
	import CommentForm from './CommentForm.svelte';

	interface Comment {
		id: number;
		testCaseId: number;
		userId: string;
		content: string;
		parentId: number | null;
		createdAt: string;
		updatedAt: string;
		userName: string | null;
		userEmail: string | null;
		userImage: string | null;
	}

	interface Props {
		testCaseId: number;
		projectId: number;
		currentUserId: string;
		userRole: string;
	}

	let { testCaseId, projectId, currentUserId, userRole }: Props = $props();

	const canComment = $derived(userRole !== 'VIEWER');

	let comments = $state<Comment[]>([]);
	let loading = $state(false);
	let newContent = $state('');
	let submitting = $state(false);

	let replyToId = $state<number | null>(null);
	let replyContent = $state('');
	let replySubmitting = $state(false);

	let editingId = $state<number | null>(null);
	let editContent = $state('');
	let editSubmitting = $state(false);

	let deleteTarget = $state<Comment | null>(null);
	let deleteOpen = $state(false);
	let collapsed = $state(false);

	const topLevel = $derived(comments.filter((c) => c.parentId === null));
	const totalCount = $derived(comments.length);

	function getReplies(commentId: number): Comment[] {
		return comments.filter((c) => c.parentId === commentId);
	}

	const baseUrl = $derived(
		`/api/projects/${projectId}/test-cases/${testCaseId}/comments`
	);

	async function loadComments() {
		loading = true;
		try {
			comments = await apiFetch<Comment[]>(baseUrl);
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		void testCaseId;
		void projectId;
		loadComments();
	});

	async function submitComment() {
		if (!newContent.trim()) return;
		submitting = true;
		try {
			const added = await apiPost<Comment>(baseUrl, { content: newContent.trim() });
			comments = [...comments, added];
			newContent = '';
			toast.success(m.comment_added());
		} finally {
			submitting = false;
		}
	}

	async function submitReply(parentId: number) {
		if (!replyContent.trim()) return;
		replySubmitting = true;
		try {
			const added = await apiPost<Comment>(baseUrl, { content: replyContent.trim(), parentId });
			comments = [...comments, added];
			replyContent = '';
			replyToId = null;
			toast.success(m.comment_added());
		} finally {
			replySubmitting = false;
		}
	}

	async function saveEdit(commentId: number) {
		if (!editContent.trim()) return;
		editSubmitting = true;
		try {
			const updated = await apiPatch<Comment>(`${baseUrl}/${commentId}`, { content: editContent.trim() });
			comments = comments.map((c) => (c.id === commentId ? { ...c, ...updated } : c));
			editingId = null;
			editContent = '';
			toast.success(m.comment_updated());
		} finally {
			editSubmitting = false;
		}
	}

	async function confirmDelete() {
		if (!deleteTarget) return;
		const id = deleteTarget.id;
		try {
			await apiDelete(`${baseUrl}/${id}`);
			comments = comments.filter((c) => c.id !== id && c.parentId !== id);
			toast.success(m.comment_deleted());
		} finally {
			deleteTarget = null;
			deleteOpen = false;
		}
	}

	function startEdit(comment: Comment) {
		editingId = comment.id;
		editContent = comment.content;
		replyToId = null;
	}

	function startReply(commentId: number) {
		replyToId = commentId;
		replyContent = '';
		editingId = null;
	}

	function canModify(comment: Comment): boolean {
		return comment.userId === currentUserId || userRole === 'ADMIN' || userRole === 'PROJECT_ADMIN';
	}

	function canEditComment(comment: Comment): boolean {
		return comment.userId === currentUserId || userRole === 'ADMIN';
	}
</script>

<Card.Root>
	<Card.Header class="pb-3">
		<div class="flex items-center justify-between">
			<button
				class="flex items-center gap-2 text-left"
				onclick={() => (collapsed = !collapsed)}
			>
				<Card.Title class="text-base">
					{m.comment_title()}
				</Card.Title>
				{#if totalCount > 0}
					<span class="bg-primary text-primary-foreground rounded-full px-2 py-0.5 text-xs font-medium">
						{totalCount}
					</span>
				{/if}
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
					class="text-muted-foreground transition-transform {collapsed ? '-rotate-90' : ''}"
				>
					<path d="m6 9 6 6 6-6" />
				</svg>
			</button>
		</div>
	</Card.Header>

	{#if !collapsed}
		<Card.Content class="space-y-4">
			{#if loading}
				<p class="text-muted-foreground text-sm">{m.tc_failure_loading()}</p>
			{:else if topLevel.length === 0}
				<p class="text-muted-foreground text-sm">{m.comment_empty()}</p>
			{:else}
				<div class="space-y-4">
					{#each topLevel as comment (comment.id)}
						<div class="space-y-3">
							<CommentItem
								{comment}
								editing={editingId === comment.id}
								bind:editContent
								{editSubmitting}
								canEdit={canEditComment(comment)}
								canDelete={canModify(comment)}
								canReply={canComment}
								onedit={() => startEdit(comment)}
								ondelete={() => { deleteTarget = comment; deleteOpen = true; }}
								onreply={() => startReply(comment.id)}
								onsaveedit={() => saveEdit(comment.id)}
								oncanceledit={() => { editingId = null; editContent = ''; }}
							/>

							{#each getReplies(comment.id) as reply (reply.id)}
								<div class="ml-11 border-l-2 pl-3">
									<CommentItem
										comment={reply}
										isReply
										editing={editingId === reply.id}
										bind:editContent
										{editSubmitting}
										canEdit={canEditComment(reply)}
										canDelete={canModify(reply)}
										onedit={() => startEdit(reply)}
										ondelete={() => { deleteTarget = reply; deleteOpen = true; }}
										onsaveedit={() => saveEdit(reply.id)}
										oncanceledit={() => { editingId = null; editContent = ''; }}
									/>
								</div>
							{/each}

							{#if replyToId === comment.id}
								<div class="ml-11 border-l-2 pl-3">
									<CommentForm
										bind:value={replyContent}
										placeholder={m.comment_reply_placeholder()}
										rows={2}
										submitting={replySubmitting}
										cancelLabel={m.comment_cancel_reply()}
										onsubmit={() => submitReply(comment.id)}
										oncancel={() => { replyToId = null; replyContent = ''; }}
									/>
								</div>
							{/if}
						</div>
					{/each}
				</div>
			{/if}

			{#if canComment}
				<div class="border-t pt-4">
					<CommentForm
						bind:value={newContent}
						placeholder={m.comment_placeholder()}
						rows={3}
						{submitting}
						onsubmit={submitComment}
					/>
				</div>
			{/if}
		</Card.Content>
	{/if}
</Card.Root>

<AlertDialog.Root bind:open={deleteOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{m.comment_delete_confirm_title()}</AlertDialog.Title>
			<AlertDialog.Description>{m.comment_delete_confirm()}</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>{m.common_cancel()}</AlertDialog.Cancel>
			<AlertDialog.Action onclick={confirmDelete}>{m.common_delete()}</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
