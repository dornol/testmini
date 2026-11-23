<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import * as m from '$lib/paraglide/messages.js';

	let {
		total,
		canEdit,
		newHref,
		onExport,
		onImport
	}: {
		total: number;
		canEdit: boolean;
		newHref: string;
		onExport: (format: 'csv' | 'json') => void;
		onImport: () => void;
	} = $props();
</script>

<div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
	<div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
		<h2 class="text-xl font-semibold tracking-tight">{m.tc_title()}</h2>
		{#if total > 0}
			<span class="text-muted-foreground text-xs">{m.common_total_count({ count: total })}</span>
		{/if}
	</div>
	<!-- Phones: the main action plus one menu, so the header takes a single row. -->
	<div class="flex items-center gap-2 min-[520px]:hidden">
		{#if canEdit}
			<Button class="min-w-0 flex-1" href={newHref}>{m.tc_new()}</Button>
		{/if}
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<Button class={canEdit ? '' : 'flex-1'} variant="outline" {...props}>
						{m.common_actions()}
					</Button>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="end">
				<DropdownMenu.Item onclick={() => onExport('csv')}>
					{m.tc_export_csv()}
				</DropdownMenu.Item>
				<DropdownMenu.Item onclick={() => onExport('json')}>
					{m.tc_export_json()}
				</DropdownMenu.Item>
				{#if canEdit}
					<DropdownMenu.Separator />
					<DropdownMenu.Item onclick={onImport}>{m.tc_import()}</DropdownMenu.Item>
				{/if}
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	</div>
	<div
		class="hidden w-full grid-cols-3 gap-2 min-[520px]:grid sm:flex sm:w-auto sm:flex-wrap sm:items-center"
	>
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<Button class="w-full sm:w-auto" variant="outline" {...props}>
						{m.tc_export()}
					</Button>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="end">
				<DropdownMenu.Item onclick={() => onExport('csv')}>
					{m.tc_export_csv()}
				</DropdownMenu.Item>
				<DropdownMenu.Item onclick={() => onExport('json')}>
					{m.tc_export_json()}
				</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
		{#if canEdit}
			<Button class="w-full sm:w-auto" variant="outline" onclick={onImport}>
				{m.tc_import()}
			</Button>
			<Button class="w-full sm:w-auto" href={newHref}>{m.tc_new()}</Button>
		{/if}
	</div>
</div>
