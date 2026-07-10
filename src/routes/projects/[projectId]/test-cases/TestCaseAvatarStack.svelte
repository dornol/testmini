<script lang="ts">
	import AddCircleButton from '$lib/components/AddCircleButton.svelte';

	type Assignee = {
		userId: string;
		userName: string;
	};

	let {
		assignees,
		canEdit
	}: {
		assignees: Assignee[];
		canEdit: boolean;
	} = $props();
</script>

{#if assignees && assignees.length > 0}
	<div class="flex -space-x-1.5">
		{#each assignees.slice(0, 3) as assignee (assignee.userId)}
			<span
				class="inline-flex h-5 w-5 items-center justify-center rounded-full bg-muted border-2 border-background text-[9px] font-medium uppercase leading-none"
				title={assignee.userName}>{assignee.userName.charAt(0)}</span
			>
		{/each}
		{#if assignees.length > 3}
			<span
				class="inline-flex h-5 w-5 items-center justify-center rounded-full bg-muted border-2 border-background text-[9px] font-medium leading-none text-muted-foreground"
				>+{assignees.length - 3}</span
			>
		{/if}
	</div>
{:else if canEdit}
	<AddCircleButton size="sm" />
{/if}
