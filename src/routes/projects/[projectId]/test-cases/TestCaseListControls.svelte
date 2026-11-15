<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import * as m from '$lib/paraglide/messages.js';

	type ColumnConfig = { id: string; visible: boolean };
	type TestRunOption = { id: number; name: string; environment: string };

	let {
		colConfig,
		orderedColIds,
		availableRuns,
		selectedRuns,
		getColLabel,
		toggleColVisible,
		moveCol,
		addRunColumn,
		removeRunColumn
	}: {
		colConfig: ColumnConfig[];
		orderedColIds: string[];
		availableRuns: TestRunOption[];
		selectedRuns: TestRunOption[];
		getColLabel: (colId: string) => string;
		toggleColVisible: (colId: string) => void;
		moveCol: (index: number, direction: -1 | 1) => void;
		addRunColumn: (runId: string) => void;
		removeRunColumn: (runId: number) => void;
	} = $props();
</script>

<div class="flex flex-wrap items-center gap-2">
	<Popover.Root>
		<Popover.Trigger>
			{#snippet child({ props })}
				<Button variant="outline" size="sm" class="h-7 px-2 text-xs" {...props}>
					{m.tc_columns()}
				</Button>
			{/snippet}
		</Popover.Trigger>
		<Popover.Content class="max-h-[70vh] w-60 overflow-y-auto p-2" align="start">
			{#each colConfig as col (col.id)}
				{@const visIdx = orderedColIds.indexOf(col.id)}
				<div class="flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-muted">
					<Checkbox checked={col.visible} onCheckedChange={() => toggleColVisible(col.id)} />
					<span class="ml-1 flex-1 truncate">{getColLabel(col.id)}</span>
					{#if col.visible}
						<button
							type="button"
							class="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
							disabled={visIdx === 0}
							onclick={() => moveCol(visIdx, -1)}
							aria-label={m.aria_move_column_up()}
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
								aria-hidden="true"><polyline points="18 15 12 9 6 15" /></svg
							>
						</button>
						<button
							type="button"
							class="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
							disabled={visIdx === orderedColIds.length - 1}
							onclick={() => moveCol(visIdx, 1)}
							aria-label={m.aria_move_column_down()}
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
								aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg
							>
						</button>
					{/if}
				</div>
			{/each}
		</Popover.Content>
	</Popover.Root>
</div>

{#if availableRuns.length > 0 || selectedRuns.length > 0}
	<div class="flex flex-wrap items-center gap-2">
		{#if availableRuns.length > 0}
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						<Button variant="outline" size="sm" class="h-7 px-2 text-xs" {...props}>
							{m.tc_add_run_column()}
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
								class="ml-1"><polyline points="6 9 12 15 18 9" /></svg
							>
						</Button>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="start" class="min-w-[180px]">
					{#each availableRuns as run (run.id)}
						<DropdownMenu.Item onclick={() => addRunColumn(String(run.id))} class="text-xs">
							{run.name} ({run.environment})
						</DropdownMenu.Item>
					{/each}
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		{/if}
		{#each selectedRuns as run (run.id)}
			<span class="bg-secondary inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs">
				{run.name}
				<button
					type="button"
					class="text-muted-foreground hover:text-foreground ml-0.5"
					onclick={() => removeRunColumn(run.id)}
					aria-label={m.aria_remove_run_column()}
				>
					x
				</button>
			</span>
		{/each}
	</div>
{/if}
