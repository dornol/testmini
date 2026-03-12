<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import * as m from '$lib/paraglide/messages.js';
	import { toast } from 'svelte-sonner';
	import { apiPost } from '$lib/api-client';
	import PriorityBadge from '$lib/components/PriorityBadge.svelte';
	import { statusColorText } from '$lib/execution-status';
	import SavedFilterSelector from './SavedFilterSelector.svelte';

	interface Props {
		basePath: string;
		projectId: number;
		canEdit: boolean;
		hasActiveFilters: boolean;
		search: string;
		priority: string;
		tagIds: string;
		groupId: string;
		createdBy: string;
		assigneeId: string;
		suiteId: string;
		execStatus: string;
		approvalStatus: string;
		projectTags: { id: number; name: string; color: string }[];
		projectPriorities: { id: number; name: string; color: string; position: number; isDefault: boolean }[];
		groups: { id: number; name: string; sortOrder: number; color: string | null }[];
		projectSuites: { id: number; name: string }[];
		projectMembers: { userId: string; userName: string }[];
		selectedRunIds: number[];
		projectCustomFields: { id: number; name: string; fieldType: string; options: string[] | null }[];
		customFieldFilters: { fieldId: number; value: string }[];
		savedFilters: { id: number; name: string; filters: Record<string, unknown>; filterType: string }[];
	}

	let {
		basePath, projectId, canEdit, hasActiveFilters,
		search, priority, tagIds, groupId, createdBy, assigneeId, suiteId, execStatus, approvalStatus,
		projectTags, projectPriorities, groups, projectSuites, projectMembers, selectedRunIds,
		projectCustomFields, customFieldFilters, savedFilters
	}: Props = $props();
	const execStatusOptions = ['PASS', 'FAIL', 'BLOCKED', 'SKIPPED', 'PENDING', 'NOT_EXECUTED'];
	const approvalStatusOptions = ['DRAFT', 'IN_REVIEW', 'APPROVED', 'REJECTED'];
	const selectedApprovalStatuses = $derived(parseMulti(approvalStatus));

	let searchInput = $state('');
	let searchTimeout: ReturnType<typeof setTimeout>;
	let newGroupName = $state('');
	let creatingGroup = $state(false);

	$effect(() => {
		searchInput = search;
	});

	function parseMulti(val: string): string[] {
		return val ? val.split(',').filter(Boolean) : [];
	}

	const selectedTagIds = $derived(
		(tagIds ?? '').split(',').map(Number).filter((id) => !isNaN(id) && id > 0)
	);
	const selectedPriorities = $derived(parseMulti(priority));
	const selectedSuiteIds = $derived(parseMulti(suiteId));
	const selectedExecStatuses = $derived(parseMulti(execStatus));
	const selectedCreatedByIds = $derived(parseMulti(createdBy));
	const selectedAssigneeIds = $derived(parseMulti(assigneeId));
	const selectedGroupId = $derived(groupId || '');
	const activeCfFilterCount = $derived(customFieldFilters.length);

	function getCfFilterValue(fieldId: number): string {
		return customFieldFilters.find((f) => f.fieldId === fieldId)?.value ?? '';
	}

	function setCfFilter(fieldId: number, value: string) {
		const params = new URLSearchParams(page.url.searchParams);
		const key = `cf_${fieldId}`;
		if (value) {
			params.set(key, value);
		} else {
			params.delete(key);
		}
		goto(`${basePath}?${params.toString()}`);
	}

	function toggleCfMultiValue(fieldId: number, option: string) {
		const current = getCfFilterValue(fieldId);
		const values = current ? current.split(',').filter(Boolean) : [];
		const idx = values.indexOf(option);
		if (idx >= 0) values.splice(idx, 1);
		else values.push(option);
		setCfFilter(fieldId, values.join(','));
	}

	function handleSearch() {
		clearTimeout(searchTimeout);
		searchTimeout = setTimeout(() => {
			const params = new URLSearchParams(page.url.searchParams);
			if (searchInput) {
				params.set('search', searchInput);
			} else {
				params.delete('search');
			}
			params.delete('page');
			goto(`${basePath}?${params.toString()}`, { keepFocus: true });
		}, 300);
	}

	function toggleFilter(paramName: string, value: string) {
		const params = new URLSearchParams(page.url.searchParams);
		const current = parseMulti(params.get(paramName) ?? '');
		const idx = current.indexOf(value);
		if (idx >= 0) current.splice(idx, 1);
		else current.push(value);
		if (current.length > 0) params.set(paramName, current.join(','));
		else params.delete(paramName);
		goto(`${basePath}?${params.toString()}`);
	}

	function setSingleFilter(paramName: string, value: string) {
		const params = new URLSearchParams(page.url.searchParams);
		const current = params.get(paramName) ?? '';
		if (current === value) params.delete(paramName);
		else params.set(paramName, value);
		goto(`${basePath}?${params.toString()}`);
	}

	function clearAllFilters() {
		goto(basePath);
	}

	async function createGroup() {
		if (!newGroupName.trim() || creatingGroup) return;
		creatingGroup = true;
		try {
			await apiPost(`/api/projects/${projectId}/test-case-groups`, { name: newGroupName.trim() });
			toast.success(m.group_created());
			newGroupName = '';
			await invalidateAll();
		} catch {
			// error toast handled by apiPost
		} finally {
			creatingGroup = false;
		}
	}
</script>

<div class="flex flex-wrap items-center gap-2">
	<SavedFilterSelector {projectId} {savedFilters} {hasActiveFilters} {basePath} />

	<Input
		placeholder={m.tc_search_placeholder()}
		class="h-7 max-w-xs text-xs"
		bind:value={searchInput}
		oninput={handleSearch}
		aria-label={m.tc_search_placeholder()}
	/>

	<!-- Priority filter -->
	<Popover.Root>
		<Popover.Trigger>
			{#snippet child({ props })}
				<Button variant="outline" size="sm" class="h-7 px-2 text-xs" {...props}>
					{m.common_priority()}{selectedPriorities.length > 0 ? ` (${selectedPriorities.length})` : ''}
				</Button>
			{/snippet}
		</Popover.Trigger>
		<Popover.Content class="w-40 p-2" align="start">
			{#each projectPriorities as p (p.id)}
				<label class="flex items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-muted cursor-pointer">
					<Checkbox checked={selectedPriorities.includes(p.name)} onCheckedChange={() => toggleFilter('priority', p.name)} />
					<PriorityBadge name={p.name} color={p.color} />
				</label>
			{/each}
		</Popover.Content>
	</Popover.Root>

	<!-- Approval status filter -->
	<Popover.Root>
		<Popover.Trigger>
			{#snippet child({ props })}
				<Button variant="outline" size="sm" class="h-7 px-2 text-xs" {...props}>
					{m.approval_filter()}{selectedApprovalStatuses.length > 0 ? ` (${selectedApprovalStatuses.length})` : ''}
				</Button>
			{/snippet}
		</Popover.Trigger>
		<Popover.Content class="w-40 p-2" align="start">
			{#each approvalStatusOptions as st}
				{@const label = st === 'DRAFT' ? m.approval_draft() : st === 'IN_REVIEW' ? m.approval_in_review() : st === 'APPROVED' ? m.approval_approved() : m.approval_rejected()}
				<label class="flex items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-muted cursor-pointer">
					<Checkbox checked={selectedApprovalStatuses.includes(st)} onCheckedChange={() => toggleFilter('approvalStatus', st)} />
					{label}
				</label>
			{/each}
		</Popover.Content>
	</Popover.Root>

	<!-- Retest needed filter -->
	<Button
		variant={page.url.searchParams.get('retestNeeded') === 'true' ? 'default' : 'outline'}
		size="sm"
		class="h-7 px-2 text-xs"
		onclick={() => {
			const params = new URLSearchParams(page.url.searchParams);
			if (params.get('retestNeeded') === 'true') {
				params.delete('retestNeeded');
			} else {
				params.set('retestNeeded', 'true');
			}
			goto(`${basePath}?${params.toString()}`);
		}}
	>
		{m.retest_filter()}
	</Button>

	<!-- Suite filter -->
	{#if projectSuites.length > 0}
		<Popover.Root>
			<Popover.Trigger>
				{#snippet child({ props })}
					<Button variant="outline" size="sm" class="h-7 px-2 text-xs" {...props}>
						{m.tc_filter_suite()}{selectedSuiteIds.length > 0 ? ` (${selectedSuiteIds.length})` : ''}
					</Button>
				{/snippet}
			</Popover.Trigger>
			<Popover.Content class="w-48 p-2" align="start">
				{#each projectSuites as s (s.id)}
					<label class="flex items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-muted cursor-pointer">
						<Checkbox checked={selectedSuiteIds.includes(String(s.id))} onCheckedChange={() => toggleFilter('suiteId', String(s.id))} />
						{s.name}
					</label>
				{/each}
			</Popover.Content>
		</Popover.Root>
	{/if}

	<!-- Execution status filter (only when runs are selected) -->
	{#if selectedRunIds.length > 0}
		<Popover.Root>
			<Popover.Trigger>
				{#snippet child({ props })}
					<Button variant="outline" size="sm" class="h-7 px-2 text-xs" {...props}>
						{m.tc_filter_exec_status()}{selectedExecStatuses.length > 0 ? ` (${selectedExecStatuses.length})` : ''}
					</Button>
				{/snippet}
			</Popover.Trigger>
			<Popover.Content class="w-44 p-2" align="start">
				{#each execStatusOptions as st}
					<label class="flex items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-muted cursor-pointer">
						<Checkbox checked={selectedExecStatuses.includes(st)} onCheckedChange={() => toggleFilter('execStatus', st)} />
						<span class={statusColorText(st)}>{st}</span>
					</label>
				{/each}
			</Popover.Content>
		</Popover.Root>
	{/if}

	<!-- Group filter (single-select) -->
	{#if groups.length > 0}
		{@const selectedGroupName = selectedGroupId === 'uncategorized' ? m.tc_filter_uncategorized() : groups.find((g) => String(g.id) === selectedGroupId)?.name}
		<Popover.Root>
			<Popover.Trigger>
				{#snippet child({ props })}
					<Button variant="outline" size="sm" class="h-7 px-2 text-xs gap-1" {...props}>
						{selectedGroupName ?? m.tc_filter_group()}
						{#if selectedGroupId}
							<span
								class="ml-0.5 -mr-1 rounded-full p-0.5 hover:bg-muted-foreground/20 transition-colors"
								onclick={(e) => { e.stopPropagation(); setSingleFilter('groupId', selectedGroupId); }}
								onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setSingleFilter('groupId', selectedGroupId); } }}
								role="button"
								tabindex="-1"
								aria-label="Clear group filter"
							>
								<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
							</span>
						{/if}
					</Button>
				{/snippet}
			</Popover.Trigger>
			<Popover.Content class="w-48 p-1" align="start">
				<button
					type="button"
					class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-muted cursor-pointer {selectedGroupId === 'uncategorized' ? 'bg-muted font-medium' : ''}"
					onclick={() => setSingleFilter('groupId', 'uncategorized')}
				>
					{m.tc_filter_uncategorized()}
				</button>
				{#each groups as g (g.id)}
					<button
						type="button"
						class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-muted cursor-pointer {selectedGroupId === String(g.id) ? 'bg-muted font-medium' : ''}"
						onclick={() => setSingleFilter('groupId', String(g.id))}
					>
						{#if g.color}
							<span class="inline-block h-2 w-2 shrink-0 rounded-full" style="background-color: {g.color}"></span>
						{/if}
						{g.name}
					</button>
				{/each}
			</Popover.Content>
		</Popover.Root>
	{/if}

	<!-- Tag filter -->
	{#if projectTags.length > 0}
		<Popover.Root>
			<Popover.Trigger>
				{#snippet child({ props })}
					<Button variant="outline" size="sm" class="h-7 px-2 text-xs" {...props}>
						{m.nav_tags()}{selectedTagIds.length > 0 ? ` (${selectedTagIds.length})` : ''}
					</Button>
				{/snippet}
			</Popover.Trigger>
			<Popover.Content class="w-48 p-2" align="start">
				{#each projectTags as t (t.id)}
					<label class="flex items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-muted cursor-pointer">
						<Checkbox checked={selectedTagIds.includes(t.id)} onCheckedChange={() => toggleFilter('tagIds', String(t.id))} />
						<span class="inline-block h-2 w-2 rounded-full" style="background-color: {t.color}"></span>
						{t.name}
					</label>
				{/each}
			</Popover.Content>
		</Popover.Root>
	{/if}

	<!-- CreatedBy filter -->
	{#if projectMembers.length > 0}
		<Popover.Root>
			<Popover.Trigger>
				{#snippet child({ props })}
					<Button variant="outline" size="sm" class="h-7 px-2 text-xs" {...props}>
						{m.tc_filter_created_by()}{selectedCreatedByIds.length > 0 ? ` (${selectedCreatedByIds.length})` : ''}
					</Button>
				{/snippet}
			</Popover.Trigger>
			<Popover.Content class="w-48 p-2" align="start">
				{#each projectMembers as member}
					<label class="flex items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-muted cursor-pointer">
						<Checkbox checked={selectedCreatedByIds.includes(member.userId)} onCheckedChange={() => toggleFilter('createdBy', member.userId)} />
						{member.userName}
					</label>
				{/each}
			</Popover.Content>
		</Popover.Root>

		<!-- Assignee filter -->
		<Popover.Root>
			<Popover.Trigger>
				{#snippet child({ props })}
					<Button variant="outline" size="sm" class="h-7 px-2 text-xs" {...props}>
						{m.tc_filter_assignee()}{selectedAssigneeIds.length > 0 ? ` (${selectedAssigneeIds.length})` : ''}
					</Button>
				{/snippet}
			</Popover.Trigger>
			<Popover.Content class="w-48 p-2" align="start">
				{#each projectMembers as member}
					<label class="flex items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-muted cursor-pointer">
						<Checkbox checked={selectedAssigneeIds.includes(member.userId)} onCheckedChange={() => toggleFilter('assigneeId', member.userId)} />
						{member.userName}
					</label>
				{/each}
			</Popover.Content>
		</Popover.Root>
	{/if}

	<!-- Custom field filters -->
	{#if projectCustomFields.length > 0}
		<Popover.Root>
			<Popover.Trigger>
				{#snippet child({ props })}
					<Button variant="outline" size="sm" class="h-7 px-2 text-xs" {...props}>
						{m.tc_custom_field_filter()}{activeCfFilterCount > 0 ? ` (${activeCfFilterCount})` : ''}
					</Button>
				{/snippet}
			</Popover.Trigger>
			<Popover.Content class="w-64 p-3 space-y-3" align="start">
				{#each projectCustomFields as cf (cf.id)}
					<div class="space-y-1">
						<label class="text-xs font-medium text-muted-foreground" for="cf-filter-{cf.id}">{cf.name}</label>
						{#if cf.fieldType === 'TEXT' || cf.fieldType === 'URL'}
							<Input
								id="cf-filter-{cf.id}"
								class="h-7 text-xs"
								placeholder={cf.name}
								value={getCfFilterValue(cf.id)}
								onchange={(e) => setCfFilter(cf.id, (e.currentTarget as HTMLInputElement).value)}
							/>
						{:else if cf.fieldType === 'NUMBER'}
							<Input
								id="cf-filter-{cf.id}"
								type="number"
								class="h-7 text-xs"
								placeholder={cf.name}
								value={getCfFilterValue(cf.id)}
								onchange={(e) => setCfFilter(cf.id, (e.currentTarget as HTMLInputElement).value)}
							/>
						{:else if cf.fieldType === 'DATE'}
							<Input
								id="cf-filter-{cf.id}"
								type="date"
								class="h-7 text-xs"
								value={getCfFilterValue(cf.id)}
								onchange={(e) => setCfFilter(cf.id, (e.currentTarget as HTMLInputElement).value)}
							/>
						{:else if cf.fieldType === 'CHECKBOX'}
							<select
								id="cf-filter-{cf.id}"
								class="h-7 w-full rounded-md border border-input bg-background px-2 text-xs"
								value={getCfFilterValue(cf.id)}
								onchange={(e) => setCfFilter(cf.id, (e.currentTarget as HTMLSelectElement).value)}
							>
								<option value="">--</option>
								<option value="true">true</option>
								<option value="false">false</option>
							</select>
						{:else if (cf.fieldType === 'SELECT' || cf.fieldType === 'MULTISELECT') && cf.options}
							{@const selectedValues = getCfFilterValue(cf.id).split(',').filter(Boolean)}
							{#each cf.options as opt}
								<label class="flex items-center gap-2 rounded px-2 py-1 text-xs hover:bg-muted cursor-pointer">
									<Checkbox
										checked={selectedValues.includes(opt)}
										onCheckedChange={() => toggleCfMultiValue(cf.id, opt)}
									/>
									{opt}
								</label>
							{/each}
						{/if}
					</div>
				{/each}
			</Popover.Content>
		</Popover.Root>
	{/if}

	<!-- Clear all filters -->
	{#if hasActiveFilters}
		<Button
			variant="ghost"
			size="sm"
			class="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
			onclick={clearAllFilters}
		>
			{m.tc_filter_clear()}
		</Button>
	{/if}

	<!-- New group input -->
	{#if canEdit}
		<div class="flex items-center gap-1 ml-auto">
			<Input
				placeholder={m.group_name_placeholder()}
				class="h-7 w-40 text-xs"
				bind:value={newGroupName}
				onkeydown={(e) => { if (e.key === 'Enter') createGroup(); }}
			/>
			<Button
				size="sm"
				class="h-7 px-2 text-xs"
				disabled={!newGroupName.trim() || creatingGroup}
				onclick={createGroup}
			>
				{m.group_new()}
			</Button>
		</div>
	{/if}
</div>
