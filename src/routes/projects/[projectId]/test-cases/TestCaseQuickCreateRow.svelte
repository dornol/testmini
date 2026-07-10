<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import * as m from '$lib/paraglide/messages.js';
	import PriorityBadge from '$lib/components/PriorityBadge.svelte';

	type PriorityOption = { id: number; name: string; color: string };

	let {
		groupKey,
		canEdit,
		dndDisabled,
		title,
		priority,
		submitting,
		priorityOptions,
		onTitleChange,
		onPriorityChange,
		onSubmittingChange,
		onCreated
	}: {
		groupKey: number;
		canEdit: boolean;
		dndDisabled: boolean;
		title: string;
		priority: string;
		submitting: boolean;
		priorityOptions: PriorityOption[];
		onTitleChange: (value: string) => void;
		onPriorityChange: (value: string) => void;
		onSubmittingChange: (value: boolean) => void;
		onCreated: () => void;
	} = $props();
</script>

<form
	method="POST"
	action="?/quickCreate"
	class="flex items-center gap-2 px-3 py-1.5"
	use:enhance={() => {
		onSubmittingChange(true);
		return async ({ result }) => {
			onSubmittingChange(false);
			if (result.type === 'success') {
				onCreated();
				await invalidateAll();
			}
		};
	}}
>
	{#if groupKey !== -1}
		<input type="hidden" name="groupId" value={String(groupKey)} />
	{/if}
	{#if canEdit}<span class="w-3.5 shrink-0"></span>{/if}
	{#if !dndDisabled}<span class="hidden w-6 shrink-0 sm:block"></span>{/if}
	<span class="hidden w-20 shrink-0 sm:block"></span>
	<Input
		name="title"
		placeholder={m.tc_quick_create_placeholder()}
		class="h-6 min-w-0 flex-1 text-xs"
		value={title}
		oninput={(event) => {
			onTitleChange((event.currentTarget as HTMLInputElement).value);
		}}
	/>
	<input type="hidden" name="priority" value={priority} />
	<DropdownMenu.Root>
		<DropdownMenu.Trigger>
			{#snippet child({ props })}
				<Button variant="outline" size="sm" class="h-6 shrink-0 px-1.5 text-xs" {...props}>
					{priority}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="10"
						height="10"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						class="ml-0.5"><polyline points="6 9 12 15 18 9" /></svg
					>
				</Button>
			{/snippet}
		</DropdownMenu.Trigger>
		<DropdownMenu.Content align="start" class="min-w-[100px]">
			{#each priorityOptions as option (option.id)}
				<DropdownMenu.Item onclick={() => onPriorityChange(option.name)} class="text-xs">
					<PriorityBadge name={option.name} color={option.color} />
				</DropdownMenu.Item>
			{/each}
		</DropdownMenu.Content>
	</DropdownMenu.Root>
	<Button
		type="submit"
		size="sm"
		class="h-6 shrink-0 px-2 text-xs"
		disabled={!title.trim() || submitting}
	>
		{submitting ? '...' : '+'}
	</Button>
</form>
