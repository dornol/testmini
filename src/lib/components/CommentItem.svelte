<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
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

	let {
		comment,
		isReply = false,
		editing = false,
		editContent = $bindable(''),
		editSubmitting = false,
		canEdit = false,
		canDelete = false,
		canReply = false,
		onedit,
		ondelete,
		onreply,
		onsaveedit,
		oncanceledit
	}: {
		comment: Comment;
		isReply?: boolean;
		editing?: boolean;
		editContent?: string;
		editSubmitting?: boolean;
		canEdit?: boolean;
		canDelete?: boolean;
		canReply?: boolean;
		onedit?: () => void;
		ondelete?: () => void;
		onreply?: () => void;
		onsaveedit?: () => void;
		oncanceledit?: () => void;
	} = $props();

	const avatarSize = $derived(isReply ? 'h-7 w-7' : 'h-8 w-8');

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

	function isEdited(c: Comment): boolean {
		return new Date(c.updatedAt).getTime() - new Date(c.createdAt).getTime() > 2000;
	}
</script>

<div class="flex gap-3">
	<div class="bg-muted flex {avatarSize} flex-shrink-0 items-center justify-center rounded-full text-xs font-medium">
		{#if comment.userImage}
			<img
				src={comment.userImage}
				alt={comment.userName ?? ''}
				class="{avatarSize} rounded-full object-cover"
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

		{#if editing}
			<div class="mt-2 space-y-2">
				<Textarea bind:value={editContent} rows={isReply ? 2 : 3} class="text-sm" />
				<div class="flex gap-2">
					<Button
						size="sm"
						disabled={editSubmitting || !editContent.trim()}
						onclick={onsaveedit}
					>
						{m.comment_save()}
					</Button>
					<Button size="sm" variant="outline" onclick={oncanceledit}>
						{m.comment_cancel()}
					</Button>
				</div>
			</div>
		{:else}
			<p class="mt-1 whitespace-pre-wrap text-sm">{comment.content}</p>
			<div class="mt-1.5 flex items-center gap-2">
				{#if canReply}
					<button
						class="text-muted-foreground hover:text-foreground text-xs"
						onclick={onreply}
					>
						{m.comment_reply()}
					</button>
				{/if}
				{#if canEdit}
					<button
						class="text-muted-foreground hover:text-foreground text-xs"
						onclick={onedit}
					>
						{m.comment_edit()}
					</button>
				{/if}
				{#if canDelete}
					<button
						class="text-destructive/70 hover:text-destructive text-xs"
						onclick={ondelete}
					>
						{m.comment_delete()}
					</button>
				{/if}
			</div>
		{/if}
	</div>
</div>
