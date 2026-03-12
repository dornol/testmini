<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import PriorityBadge from '$lib/components/PriorityBadge.svelte';

	type StatusDropdown = { tcId: number; runId: number; x: number; y: number } | null;
	type AssigneePopover = { tcId: number; x: number; y: number } | null;
	type TagPopoverState = { tcId: number; x: number; y: number } | null;
	type PriorityPopoverState = { tcId: number; currentValue: string; x: number; y: number } | null;
	type CfPopoverState = { tcId: number; cfId: number; fieldType: string; options: string[] | null; x: number; y: number; value: unknown } | null;

	const TAG_PALETTE = [
		'#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6',
		'#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#6b7280'
	];

	const allStatuses = ['PENDING', 'PASS', 'FAIL', 'BLOCKED', 'SKIPPED'];

	function statusColor(status: string): string {
		switch (status) {
			case 'PASS':
				return 'text-green-600 dark:text-green-400';
			case 'FAIL':
				return 'text-red-600 dark:text-red-400';
			case 'BLOCKED':
				return 'text-yellow-600 dark:text-yellow-400';
			case 'SKIPPED':
				return 'text-gray-500';
			case 'PENDING':
				return 'text-muted-foreground';
			default:
				return 'text-muted-foreground';
		}
	}

	let {
		// Popover states (bindable)
		openDropdown = $bindable(),
		assigneePopover = $bindable(),
		tagPopover = $bindable(),
		priorityPopover = $bindable(),
		cfPopover = $bindable(),
		tagSearchInput = $bindable(),
		newTagColor = $bindable(),
		// Data
		testCases,
		executionMap,
		projectMembers,
		projectTags,
		projectPriorities,
		// Callbacks
		onUpdateExecutionStatus,
		onDeleteExecution,
		onToggleAssignee,
		onToggleTag,
		onCreateAndAssignTag,
		onSelectPriority,
		onSaveCfValue,
		onOpenFailureSheet,
		onOpenFailDialog,
	}: {
		openDropdown: StatusDropdown;
		assigneePopover: AssigneePopover;
		tagPopover: TagPopoverState;
		priorityPopover: PriorityPopoverState;
		cfPopover: CfPopoverState;
		tagSearchInput: string;
		newTagColor: string;
		testCases: any[];
		executionMap: Record<number, Record<number, any>>;
		projectMembers: any[];
		projectTags: any[];
		projectPriorities: any[];
		onUpdateExecutionStatus: (runId: number, executionId: number, status: string, tcKey: string) => void;
		onDeleteExecution: (runId: number, executionId: number) => void;
		onToggleAssignee: (tcId: number, userId: string) => void;
		onToggleTag: (tcId: number, tagId: number) => void;
		onCreateAndAssignTag: (tcId: number, name: string, color: string) => void;
		onSelectPriority: (tcId: number, name: string) => void;
		onSaveCfValue: (tcId: number, cfId: number, value: unknown) => void;
		onOpenFailureSheet: (runId: number, executionId: number) => void;
		onOpenFailDialog: (runId: number, executionId: number, tcKey: string) => void;
	} = $props();

	const priorityOptions = $derived(projectPriorities);
</script>

<!-- Fixed-position status dropdown -->
{#if openDropdown}
	{@const tcId = openDropdown.tcId}
	{@const runId = openDropdown.runId}
	{@const exec = executionMap[tcId]?.[runId]}
	{@const tcKey = testCases.find((tc) => tc.id === tcId)?.key ?? ''}
	{#if exec}
		<div
			data-status-dropdown
			class="fixed z-[9999] bg-popover border rounded-md shadow-lg py-1 min-w-[100px]"
			style="left: {openDropdown.x}px; top: {openDropdown.y}px; transform: translateX(-50%);"
		>
			{#each allStatuses as s}
				<button
					type="button"
					class="block w-full px-3 py-1.5 text-left text-xs hover:bg-muted cursor-pointer {statusColor(s)} {s === exec.status ? 'font-bold' : ''}"
					onclick={() => onUpdateExecutionStatus(runId, exec.executionId, s, tcKey)}
				>
					{s}
				</button>
			{/each}
			{#if exec.status === 'FAIL'}
				<div class="border-t my-1"></div>
				<button
					type="button"
					class="block w-full px-3 py-1.5 text-left text-xs hover:bg-muted text-muted-foreground"
					onclick={() => { openDropdown = null; onOpenFailureSheet(runId, exec.executionId); }}
				>
					{m.fail_details()}
				</button>
				<button
					type="button"
					class="block w-full px-3 py-1.5 text-left text-xs hover:bg-muted text-muted-foreground"
					onclick={() => { openDropdown = null; onOpenFailDialog(runId, exec.executionId, tcKey); }}
				>
					{m.fail_add_detail()}
				</button>
			{/if}
			<div class="border-t my-1"></div>
			<button
				type="button"
				class="block w-full px-3 py-1.5 text-left text-xs hover:bg-destructive/10 cursor-pointer text-destructive"
				onclick={() => onDeleteExecution(runId, exec.executionId)}
			>
				{m.common_delete()}
			</button>
		</div>
	{/if}
{/if}

<!-- Fixed-position assignee popover -->
{#if assigneePopover}
	{@const tcForPopover = testCases.find((tc) => tc.id === assigneePopover!.tcId)}
	<div
		data-assignee-popover
		class="fixed z-[9999] bg-popover border rounded-md shadow-lg py-1 min-w-[150px] max-h-[240px] overflow-y-auto"
		style="left: {assigneePopover.x}px; top: {assigneePopover.y}px; transform: translateX(-50%);"
		role="listbox"
		tabindex="-1"
		aria-label="Assign members"
		onclick={(e) => e.stopPropagation()}
		onkeydown={(e) => e.stopPropagation()}
	>
		{#each projectMembers as member (member.userId)}
			{@const isAssigned = tcForPopover?.assignees?.some((a: any) => a.userId === member.userId) ?? false}
			<button
				type="button"
				class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-muted transition-colors {isAssigned ? 'font-bold bg-muted/50' : ''}"
				onclick={() => onToggleAssignee(assigneePopover!.tcId, member.userId)}
			>
				<span class="inline-flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[9px] font-medium uppercase shrink-0">{member.userName.charAt(0)}</span>
				<span class="truncate flex-1">{member.userName}</span>
				{#if isAssigned}
					<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="text-primary shrink-0"><polyline points="20 6 9 17 4 12"/></svg>
				{/if}
			</button>
		{/each}
		{#if projectMembers.length === 0}
			<div class="px-3 py-1.5 text-xs text-muted-foreground">-</div>
		{/if}
	</div>
{/if}

<!-- Fixed-position tag popover -->
{#if tagPopover}
	{@const tcForTagPopover = testCases.find((tc) => tc.id === tagPopover!.tcId)}
	{@const filteredTags = tagSearchInput
		? projectTags.filter((t) => t.name.toLowerCase().includes(tagSearchInput.toLowerCase()))
		: projectTags}
	{@const exactMatch = tagSearchInput && projectTags.some((t) => t.name.toLowerCase() === tagSearchInput.toLowerCase().trim())}
	{@const canCreateNew = tagSearchInput.trim().length > 0 && !exactMatch}
	<div
		data-tag-popover
		class="fixed z-[9999] bg-popover border rounded-md shadow-lg p-2 min-w-[200px] max-w-[240px]"
		style="left: {tagPopover.x}px; top: {tagPopover.y}px; transform: translateX(-50%);"
		role="listbox"
		tabindex="-1"
		aria-label="Manage tags"
		onclick={(e) => e.stopPropagation()}
		onkeydown={(e) => e.stopPropagation()}
	>
		<input
			type="text"
			placeholder={m.tag_new_inline()}
			class="w-full h-7 text-xs border rounded px-2 mb-1.5 bg-background outline-none focus:ring-1 focus:ring-ring"
			bind:value={tagSearchInput}
		/>
		<div class="max-h-40 overflow-y-auto space-y-0.5">
			{#each filteredTags as t (t.id)}
				{@const isAssigned = tcForTagPopover?.tags?.some((tt: any) => tt.id === t.id) ?? false}
				<button
					type="button"
					class="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-muted transition-colors rounded {isAssigned ? 'font-bold bg-muted/50' : ''}"
					onclick={() => onToggleTag(tagPopover!.tcId, t.id)}
				>
					<span class="h-2 w-2 rounded-full shrink-0" style="background-color: {t.color}"></span>
					<span class="truncate flex-1">{t.name}</span>
					{#if isAssigned}
						<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="text-primary shrink-0"><polyline points="20 6 9 17 4 12"/></svg>
					{/if}
				</button>
			{/each}
		</div>
		{#if canCreateNew}
			<div class="border-t mt-1 pt-1">
				<div class="flex items-center gap-1 mb-1.5">
					{#each TAG_PALETTE as color (color)}
						<button
							type="button"
							class="h-4 w-4 rounded-full border {newTagColor === color ? 'border-foreground scale-110' : 'border-transparent'}"
							style="background-color: {color}"
							aria-label="Select color {color}"
							onclick={() => (newTagColor = color)}
						></button>
					{/each}
				</div>
				<button
					type="button"
					class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-muted cursor-pointer font-medium"
					onclick={() => onCreateAndAssignTag(tagPopover!.tcId, tagSearchInput, newTagColor)}
				>
					<span class="h-2 w-2 rounded-full shrink-0" style="background-color: {newTagColor}"></span>
					{m.tag_create_inline({ name: tagSearchInput.trim() })}
				</button>
			</div>
		{/if}
		{#if filteredTags.length === 0 && !canCreateNew}
			<p class="text-xs text-muted-foreground text-center py-2">{m.common_no_results()}</p>
		{/if}
	</div>
{/if}

<!-- Fixed-position priority popover -->
{#if priorityPopover}
	<div
		data-priority-popover
		class="fixed z-[9999] bg-popover border rounded-md shadow-lg py-1 min-w-[110px]"
		style="left: {priorityPopover.x}px; top: {priorityPopover.y}px; transform: translateX(-50%);"
	>
		{#each priorityOptions as p (p.id)}
			<button
				type="button"
				class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-muted transition-colors {p.name === priorityPopover.currentValue ? 'font-bold bg-muted/50' : ''}"
				onclick={() => onSelectPriority(priorityPopover!.tcId, p.name)}
			>
				<PriorityBadge name={p.name} color={p.color} />
				{#if p.name === priorityPopover.currentValue}
					<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="text-primary ml-auto"><polyline points="20 6 9 17 4 12"/></svg>
				{/if}
			</button>
		{/each}
	</div>
{/if}

{#if cfPopover}
	<div
		data-cf-popover
		class="fixed z-[9999] bg-popover border rounded-md shadow-lg p-2 min-w-[160px]"
		style="left: {cfPopover.x}px; top: {cfPopover.y}px; transform: translateX(-50%);"
	>
		{#if cfPopover.fieldType === 'TEXT' || cfPopover.fieldType === 'URL'}
			<input
				type={cfPopover.fieldType === 'URL' ? 'url' : 'text'}
				class="w-full rounded border border-input bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-primary/30"
				placeholder={cfPopover.fieldType === 'URL' ? 'https://...' : ''}
				value={cfPopover.value ?? ''}
				autofocus
				onkeydown={(e) => {
					if (e.key === 'Enter') {
						onSaveCfValue(cfPopover!.tcId, cfPopover!.cfId, (e.currentTarget as HTMLInputElement).value || null);
					} else if (e.key === 'Escape') {
						cfPopover = null;
					}
				}}
				onblur={(e) => onSaveCfValue(cfPopover!.tcId, cfPopover!.cfId, (e.currentTarget as HTMLInputElement).value || null)}
			/>
		{:else if cfPopover.fieldType === 'NUMBER'}
			<input
				type="number"
				class="w-full rounded border border-input bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-primary/30"
				value={cfPopover.value ?? ''}
				autofocus
				onkeydown={(e) => {
					if (e.key === 'Enter') {
						const v = (e.currentTarget as HTMLInputElement).value;
						onSaveCfValue(cfPopover!.tcId, cfPopover!.cfId, v === '' ? null : Number(v));
					} else if (e.key === 'Escape') {
						cfPopover = null;
					}
				}}
				onblur={(e) => {
					const v = (e.currentTarget as HTMLInputElement).value;
					onSaveCfValue(cfPopover!.tcId, cfPopover!.cfId, v === '' ? null : Number(v));
				}}
			/>
		{:else if cfPopover.fieldType === 'DATE'}
			<input
				type="date"
				class="w-full rounded border border-input bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-primary/30"
				value={cfPopover.value ?? ''}
				autofocus
				onchange={(e) => onSaveCfValue(cfPopover!.tcId, cfPopover!.cfId, (e.currentTarget as HTMLInputElement).value || null)}
			/>
		{:else if cfPopover.fieldType === 'SELECT' && cfPopover.options}
			{#each cfPopover.options as opt (opt)}
				<button
					type="button"
					class="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-muted transition-colors rounded {cfPopover.value === opt ? 'font-bold bg-muted/50' : ''}"
					onclick={() => onSaveCfValue(cfPopover!.tcId, cfPopover!.cfId, cfPopover!.value === opt ? null : opt)}
				>
					{opt}
					{#if cfPopover.value === opt}
						<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="text-primary ml-auto"><polyline points="20 6 9 17 4 12"/></svg>
					{/if}
				</button>
			{/each}
		{:else if cfPopover.fieldType === 'MULTISELECT' && cfPopover.options}
			{@const selected = (Array.isArray(cfPopover.value) ? cfPopover.value : []) as string[]}
			{#each cfPopover.options as opt (opt)}
				<label class="flex items-center gap-2 px-2 py-1 text-xs hover:bg-muted cursor-pointer rounded">
					<input
						type="checkbox"
						class="h-3 w-3"
						checked={selected.includes(opt)}
						onchange={() => {
							const cur = (Array.isArray(cfPopover!.value) ? [...cfPopover!.value] : []) as string[];
							const idx = cur.indexOf(opt);
							if (idx >= 0) cur.splice(idx, 1);
							else cur.push(opt);
							onSaveCfValue(cfPopover!.tcId, cfPopover!.cfId, cur.length > 0 ? cur : null);
						}}
					/>
					{opt}
				</label>
			{/each}
		{/if}
	</div>
{/if}
