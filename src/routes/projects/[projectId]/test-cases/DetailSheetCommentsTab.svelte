<script lang="ts">
	import CommentSection from '$lib/components/CommentSection.svelte';
	import AttachmentManager from '$lib/components/AttachmentManager.svelte';
	import * as m from '$lib/paraglide/messages.js';

	let {
		testCaseId,
		projectId,
		currentUserId,
		userRole,
		canEdit
	}: {
		testCaseId: number;
		projectId: number;
		currentUserId: string;
		userRole: string;
		canEdit: boolean;
	} = $props();

	let activeTab = $state<'comments' | 'attachments'>('comments');
</script>

<div class="border-t pt-4">
	<div class="flex border-b mb-4">
		<button
			type="button"
			class="px-4 py-2 text-sm font-medium border-b-2 transition-colors {activeTab === 'comments' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}"
			onclick={() => (activeTab = 'comments')}
		>
			{m.comment_title()}
		</button>
		<button
			type="button"
			class="px-4 py-2 text-sm font-medium border-b-2 transition-colors {activeTab === 'attachments' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}"
			onclick={() => (activeTab = 'attachments')}
		>
			{m.attachments_title()}
		</button>
	</div>

	{#if activeTab === 'comments'}
		<CommentSection
			{testCaseId}
			{projectId}
			{currentUserId}
			{userRole}
		/>
	{:else if activeTab === 'attachments'}
		<AttachmentManager
			referenceType="TESTCASE"
			referenceId={testCaseId}
			editable={canEdit}
		/>
	{/if}
</div>
