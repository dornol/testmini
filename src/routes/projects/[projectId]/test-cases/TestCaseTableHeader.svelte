<script lang="ts">
	import * as Popover from '$lib/components/ui/popover/index.js';
	import * as m from '$lib/paraglide/messages.js';

	type ColumnId = string;
	type TestRun = { id: number; name: string; environment: string };
	type CustomField = { id: number; name: string };
	type EnvironmentInfo = {
		name: string;
		color?: string | null;
		baseUrl?: string | null;
		credentials?: string | null;
		memo?: string | null;
	};

	let {
		canEdit,
		dndDisabled,
		orderedColIds,
		selectedCount,
		testCaseCount,
		projectTagsCount,
		projectCustomFields,
		selectedRuns,
		projectEnvironments,
		onToggleSelectAll
	}: {
		canEdit: boolean;
		dndDisabled: boolean;
		orderedColIds: ColumnId[];
		selectedCount: number;
		testCaseCount: number;
		projectTagsCount: number;
		projectCustomFields: CustomField[];
		selectedRuns: TestRun[];
		projectEnvironments: EnvironmentInfo[];
		onToggleSelectAll: () => void;
	} = $props();
</script>

<div
	class="sticky top-0 z-10 flex items-center gap-2 rounded-t-lg border-x border-t border-b bg-card px-3 py-1.5 text-[10px] font-medium tracking-wider text-muted-foreground uppercase"
>
	{#if canEdit}
		<input
			type="checkbox"
			aria-label={m.aria_select_all()}
			indeterminate={selectedCount > 0 && selectedCount < testCaseCount}
			class="h-3.5 w-3.5 shrink-0 rounded border-gray-300"
			checked={selectedCount === testCaseCount && testCaseCount > 0}
			onchange={onToggleSelectAll}
		/>
	{/if}
	{#if !dndDisabled}<span class="hidden w-6 shrink-0 sm:block"></span>{/if}
	{#each orderedColIds as colId (colId)}
		{#if colId === 'key'}
			<span class="hidden w-20 shrink-0 text-center sm:block">{m.common_key()}</span>
		{:else if colId === 'title'}
			<span class="min-w-0 flex-1 text-center">{m.common_title()}</span>
		{:else if colId === 'priority'}
			<span class="hidden w-16 shrink-0 text-center md:block">{m.common_priority()}</span>
		{:else if colId === 'tags'}
			{#if projectTagsCount > 0 || canEdit}
				<span class="hidden w-28 shrink-0 text-center lg:block">{m.tag_title()}</span>
			{/if}
		{:else if colId === 'assignees'}
			<span class="hidden w-16 shrink-0 text-center lg:block">{m.assignee_title()}</span>
		{:else if colId === 'updatedBy'}
			<span class="hidden w-20 shrink-0 text-center xl:block">{m.tc_updated_by()}</span>
		{:else if colId.startsWith('cf_')}
			{@const cfId = Number(colId.slice(3))}
			{@const cf = projectCustomFields.find((field) => field.id === cfId)}
			{#if cf}
				<span class="hidden w-24 shrink-0 truncate text-center xl:block" data-tip={cf.name}
					>{cf.name}</span
				>
			{/if}
		{:else if colId.startsWith('run_')}
			{@const runId = Number(colId.slice(4))}
			{@const run = selectedRuns.find((item) => item.id === runId)}
			{#if run}
				{@const envConfig = projectEnvironments.find((env) => env.name === run.environment)}
				{@const hasEnvInfo = envConfig?.baseUrl || envConfig?.credentials || envConfig?.memo}
				{#if hasEnvInfo}
					<Popover.Root>
						<Popover.Trigger
							class="hidden w-16 shrink-0 cursor-pointer truncate text-center transition-colors hover:text-primary lg:block"
							title={run.name}
						>
							<span class="inline-flex items-center gap-0.5">
								{run.name}
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
									class="shrink-0 text-muted-foreground"
									><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path
										d="M12 8h.01"
									/></svg
								>
							</span>
						</Popover.Trigger>
						<Popover.Content class="w-72 text-left" align="start">
							<div class="space-y-2">
								<div class="flex items-center gap-2 text-sm font-medium">
									{#if envConfig?.color}
										<span
											class="h-2.5 w-2.5 shrink-0 rounded-full"
											style="background-color: {envConfig.color}"
										></span>
									{/if}
									{run.environment}
								</div>
								{#if envConfig?.baseUrl}
									<div>
										<div class="text-xs font-medium text-muted-foreground">
											{m.env_base_url()}
										</div>
										<div class="break-all text-xs">{envConfig.baseUrl}</div>
									</div>
								{/if}
								{#if envConfig?.credentials}
									<div>
										<div class="text-xs font-medium text-muted-foreground">
											{m.env_credentials()}
										</div>
										<div class="text-xs whitespace-pre-wrap">{envConfig.credentials}</div>
									</div>
								{/if}
								{#if envConfig?.memo}
									<div>
										<div class="text-xs font-medium text-muted-foreground">
											{m.env_memo()}
										</div>
										<div class="text-xs whitespace-pre-wrap">{envConfig.memo}</div>
									</div>
								{/if}
							</div>
						</Popover.Content>
					</Popover.Root>
				{:else}
					<span class="hidden w-16 shrink-0 truncate text-center lg:block" title={run.name}
						>{run.name}</span
					>
				{/if}
			{/if}
		{/if}
	{/each}
</div>
