<script lang="ts">
	import { toast } from 'svelte-sonner';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import * as m from '$lib/paraglide/messages.js';

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
			const res = await fetch(baseUrl);
			if (res.ok) {
				comments = await res.json();
			}
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
			const res = await fetch(baseUrl, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ content: newContent.trim() })
			});
			if (res.ok) {
				const added = await res.json();
				comments = [...comments, added];
				newContent = '';
				toast.success(m.comment_added());
			} else {
				const err = await res.json();
				toast.error(err.error || m.error_operation_failed());
			}
		} finally {
			submitting = false;
		}
	}

	async function submitReply(parentId: number) {
		if (!replyContent.trim()) return;
		replySubmitting = true;
		try {
			const res = await fetch(baseUrl, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ content: replyContent.trim(), parentId })
			});
			if (res.ok) {
				const added = await res.json();
				comments = [...comments, added];
				replyContent = '';
				replyToId = null;
				toast.success(m.comment_added());
			} else {
				const err = await res.json();
				toast.error(err.error || m.error_operation_failed());
			}
		} finally {
			replySubmitting = false;
		}
	}

	async function saveEdit(commentId: number) {
		if (!editContent.trim()) return;
		editSubmitting = true;
		try {
			const res = await fetch(`${baseUrl}/${commentId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ content: editContent.trim() })
			});
			if (res.ok) {
				const updated = await res.json();
				comments = comments.map((c) => (c.id === commentId ? { ...c, ...updated } : c));
				editingId = null;
				editContent = '';
				toast.success(m.comment_updated());
			} else {
				const err = await res.json();
				toast.error(err.error || m.error_update_failed());
			}
		} finally {
			editSubmitting = false;
		}
	}

	async function confirmDelete() {
		if (!deleteTarget) return;
		const id = deleteTarget.id;
		try {
			const res = await fetch(`${baseUrl}/${id}`, { method: 'DELETE' });
			if (res.ok) {
				// Remove comment and its replies
				comments = comments.filter((c) => c.id !== id && c.parentId !== id);
				toast.success(m.comment_deleted());
			} else {
				toast.error(m.error_delete_failed());
			}
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

	function cancelEdit() {
		editingId = null;
		editContent = '';
	}

	function startReply(commentId: number) {
		replyToId = commentId;
		replyContent = '';
		editingId = null;
	}

	function cancelReply() {
		replyToId = null;
		replyContent = '';
	}

	function formatRelative(dateStr: string): string {
		const date = new Date(dateStr);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffSec = Math.floor(diffMs / 1000);
		const diffMin = Math.floor(diffSec / 60);
		const diffHr = Math.floor(diffMin / 60);
		const diffDay = Math.floor(diffHr / 24);

		if (diffSec < 60) return 'just now';
		if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`;
		if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? '' : 's'} ago`;
		if (diffDay === 1) return 'yesterday';
		if (diffDay < 7) return `${diffDay} days ago`;
		return date.toLocaleDateString();
	}

	function getInitials(name: string | null): string {
		if (!name) return '?';
		return name
			.split(' ')
			.map((n) => n[0])
			.join('')
			.toUpperCase()
			.slice(0, 2);
	}

	function isEdited(comment: Comment): boolean {
		return new Date(comment.updatedAt).getTime() - new Date(comment.createdAt).getTime() > 2000;
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
							<!-- Top-level comment -->
							<div class="flex gap-3">
								<!-- Avatar -->
								<div class="bg-muted flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-medium">
									{#if comment.userImage}
										<img
											src={comment.userImage}
											alt={comment.userName ?? ''}
											class="h-8 w-8 rounded-full object-cover"
										/>
									{:else}
										{getInitials(comment.userName)}
									{/if}
								</div>

								<div class="min-w-0 flex-1">
									<div class="flex flex-wrap items-center gap-1.5">
										<span class="text-sm font-medium">{comment.userName ?? comment.userEmail ?? 'Unknown'}</span>
										<span class="text-muted-foreground text-xs">{formatRelative(comment.createdAt)}</span>
										{#if isEdited(comment)}
											<span class="text-muted-foreground text-xs">({m.comment_edited()})</span>
										{/if}
									</div>

									{#if editingId === comment.id}
										<div class="mt-2 space-y-2">
											<Textarea bind:value={editContent} rows={3} class="text-sm" />
											<div class="flex gap-2">
												<Button
													size="sm"
													disabled={editSubmitting || !editContent.trim()}
													onclick={() => saveEdit(comment.id)}
												>
													{m.comment_save()}
												</Button>
												<Button size="sm" variant="outline" onclick={cancelEdit}>
													{m.comment_cancel()}
												</Button>
											</div>
										</div>
									{:else}
										<p class="mt-1 whitespace-pre-wrap text-sm">{comment.content}</p>
										<div class="mt-1.5 flex items-center gap-2">
											{#if canComment}
												<button
													class="text-muted-foreground hover:text-foreground text-xs"
													onclick={() => startReply(comment.id)}
												>
													{m.comment_reply()}
												</button>
											{/if}
											{#if canEditComment(comment)}
												<button
													class="text-muted-foreground hover:text-foreground text-xs"
													onclick={() => startEdit(comment)}
												>
													{m.comment_edit()}
												</button>
											{/if}
											{#if canModify(comment)}
												<button
													class="text-destructive/70 hover:text-destructive text-xs"
													onclick={() => {
														deleteTarget = comment;
														deleteOpen = true;
													}}
												>
													{m.comment_delete()}
												</button>
											{/if}
										</div>
									{/if}
								</div>
							</div>

							<!-- Replies -->
							{#each getReplies(comment.id) as reply (reply.id)}
								<div class="ml-11 flex gap-3 border-l-2 pl-3">
									<div class="bg-muted flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-medium">
										{#if reply.userImage}
											<img
												src={reply.userImage}
												alt={reply.userName ?? ''}
												class="h-7 w-7 rounded-full object-cover"
											/>
										{:else}
											{getInitials(reply.userName)}
										{/if}
									</div>

									<div class="min-w-0 flex-1">
										<div class="flex flex-wrap items-center gap-1.5">
											<span class="text-sm font-medium">{reply.userName ?? reply.userEmail ?? 'Unknown'}</span>
											<span class="text-muted-foreground text-xs">{formatRelative(reply.createdAt)}</span>
											{#if isEdited(reply)}
												<span class="text-muted-foreground text-xs">({m.comment_edited()})</span>
											{/if}
										</div>

										{#if editingId === reply.id}
											<div class="mt-2 space-y-2">
												<Textarea bind:value={editContent} rows={2} class="text-sm" />
												<div class="flex gap-2">
													<Button
														size="sm"
														disabled={editSubmitting || !editContent.trim()}
														onclick={() => saveEdit(reply.id)}
													>
														{m.comment_save()}
													</Button>
													<Button size="sm" variant="outline" onclick={cancelEdit}>
														{m.comment_cancel()}
													</Button>
												</div>
											</div>
										{:else}
											<p class="mt-1 whitespace-pre-wrap text-sm">{reply.content}</p>
											<div class="mt-1.5 flex items-center gap-2">
												{#if canEditComment(reply)}
													<button
														class="text-muted-foreground hover:text-foreground text-xs"
														onclick={() => startEdit(reply)}
													>
														{m.comment_edit()}
													</button>
												{/if}
												{#if canModify(reply)}
													<button
														class="text-destructive/70 hover:text-destructive text-xs"
														onclick={() => {
															deleteTarget = reply;
															deleteOpen = true;
														}}
													>
														{m.comment_delete()}
													</button>
												{/if}
											</div>
										{/if}
									</div>
								</div>
							{/each}

							<!-- Reply input -->
							{#if replyToId === comment.id}
								<div class="ml-11 space-y-2 border-l-2 pl-3">
									<Textarea
										bind:value={replyContent}
										placeholder={m.comment_reply_placeholder()}
										rows={2}
										class="text-sm"
									/>
									<div class="flex gap-2">
										<Button
											size="sm"
											disabled={replySubmitting || !replyContent.trim()}
											onclick={() => submitReply(comment.id)}
										>
											{m.comment_submit()}
										</Button>
										<Button size="sm" variant="outline" onclick={cancelReply}>
											{m.comment_cancel_reply()}
										</Button>
									</div>
								</div>
							{/if}
						</div>
					{/each}
				</div>
			{/if}

			<!-- New comment form -->
			{#if canComment}
				<div class="space-y-2 border-t pt-4">
					<Textarea
						bind:value={newContent}
						placeholder={m.comment_placeholder()}
						rows={3}
						class="text-sm"
					/>
					<Button size="sm" disabled={submitting || !newContent.trim()} onclick={submitComment}>
						{submitting ? m.common_saving() : m.comment_submit()}
					</Button>
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
