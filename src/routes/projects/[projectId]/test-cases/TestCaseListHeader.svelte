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

<div class="flex items-center justify-between">
	<div class="flex items-center gap-2">
		<h2 class="text-lg font-semibold">{m.tc_title()}</h2>
		{#if total > 0}
			<span class="text-muted-foreground text-xs">{m.common_total_count({ count: total })}</span>
		{/if}
	</div>
	<div class="flex items-center gap-2">
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<Button variant="outline" size="sm" {...props}>{m.tc_export()}</Button>
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
			<Button variant="outline" size="sm" onclick={onImport}>{m.tc_import()}</Button>
			<Button href={newHref} size="sm">{m.tc_new()}</Button>
		{/if}
	</div>
</div>
