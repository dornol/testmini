<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';

	type Group = {
		id: number;
		name: string;
		color: string | null;
		items: { id: number }[];
	};

	let {
		group,
		collapsed,
		editing,
		editingName,
		canEdit,
		canDelete,
		onToggle,
		onEditNameChange,
		onEditCommit,
		onEditKeydown,
		onStartEdit,
		onDelete
	}: {
		group: Group;
		collapsed: boolean;
		editing: boolean;
		editingName: string;
		canEdit: boolean;
		canDelete: boolean;
		onToggle: () => void;
		onEditNameChange: (value: string) => void;
		onEditCommit: () => void;
		onEditKeydown: (event: KeyboardEvent) => void;
		onStartEdit: () => void;
		onDelete: () => void;
	} = $props();

	function focusOnMount(node: HTMLInputElement) {
		node.focus();
		node.select();
	}
</script>

<button
	type="button"
	class="text-muted-foreground hover:text-foreground transition-colors"
	onclick={onToggle}
>
	{#if collapsed}
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="14"
			height="14"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"><polyline points="9 18 15 12 9 6" /></svg
		>
	{:else}
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="14"
			height="14"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"><polyline points="6 9 12 15 18 9" /></svg
		>
	{/if}
</button>
{#if group.color}
	<span class="h-2.5 w-2.5 rounded-full shrink-0" style="background-color: {group.color}"></span>
{/if}
{#if editing}
	<input
		use:focusOnMount
		type="text"
		class="border-primary bg-background h-6 rounded border px-1.5 text-xs font-semibold outline-none ring-1 ring-primary/30 flex-1"
		value={editingName}
		oninput={(event) => onEditNameChange(event.currentTarget.value)}
		onblur={onEditCommit}
		onkeydown={onEditKeydown}
	/>
{:else}
	<button
		type="button"
		class="text-sm font-semibold hover:underline text-left"
		ondblclick={() => {
			if (canEdit) onStartEdit();
		}}
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
			title={m.aria_edit_name()}
			aria-label={m.aria_edit_name()}
			onclick={onStartEdit}
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="12"
				height="12"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path
					d="m15 5 4 4"
				/></svg
			>
		</button>
	{/if}
	{#if canDelete}
		<button
			type="button"
			class="text-muted-foreground hover:text-destructive p-0.5 rounded hover:bg-muted transition-colors"
			title={m.aria_delete_group()}
			aria-label={m.aria_delete_group()}
			onclick={onDelete}
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="12"
				height="12"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				><path d="M3 6h18" /><path
					d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"
				/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg
			>
		</button>
	{/if}
</div>
