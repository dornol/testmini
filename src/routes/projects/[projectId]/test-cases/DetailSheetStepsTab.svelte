<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import * as m from '$lib/paraglide/messages.js';

	interface Step {
		order: number;
		action: string;
		expected: string;
	}

	let {
		precondition,
		steps,
		stepFormat,
		expectedResult,
		automationKey,
		canEdit,
		onstartedit
	}: {
		precondition: string | null | undefined;
		steps: Step[] | null | undefined;
		stepFormat: string | null | undefined;
		expectedResult: string | null | undefined;
		automationKey: string | null | undefined;
		canEdit: boolean;
		onstartedit: () => void;
	} = $props();

	const hasContent = $derived(
		!!precondition || (steps && steps.length > 0) || !!expectedResult || !!automationKey
	);
</script>

<div class="space-y-5">
	{#if precondition}
		<div class="space-y-1.5">
			<div class="flex items-center gap-1.5">
				<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/></svg>
				<h4 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{m.tc_precondition()}</h4>
			</div>
			<div class="bg-muted/40 rounded-lg p-3">
				<p class="whitespace-pre-wrap text-sm leading-relaxed">{precondition}</p>
			</div>
		</div>
	{/if}

	{#if steps && steps.length > 0}
		<div class="space-y-2">
			<div class="flex items-center gap-1.5">
				<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/></svg>
				<h4 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{m.tc_detail_steps()}</h4>
				{#if stepFormat === 'GHERKIN'}
					<span class="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded font-medium">BDD</span>
				{/if}
			</div>
			{#if stepFormat === 'GHERKIN'}
				<div class="space-y-1 rounded-md border p-3">
					{#each steps as step, i (i)}
						{@const parts = step.action.split(' ')}
						{@const keyword = parts[0]}
						{@const stepText = parts.slice(1).join(' ')}
						{@const isKeyword = ['Given', 'When', 'Then', 'And', 'But'].includes(keyword)}
						<div class="text-sm">
							{#if isKeyword}
								<span class="font-bold {keyword === 'Given' ? 'text-blue-600 dark:text-blue-400' : keyword === 'When' ? 'text-amber-600 dark:text-amber-400' : keyword === 'Then' ? 'text-green-600 dark:text-green-400' : 'text-purple-600 dark:text-purple-400'}">{keyword}</span>
								<span class="ml-1">{stepText}</span>
							{:else}
								<span>{step.action}</span>
							{/if}
							{#if step.expected}
								<span class="text-muted-foreground text-xs ml-2">({step.expected})</span>
							{/if}
						</div>
					{/each}
				</div>
			{:else}
				<div class="space-y-2">
					{#each steps as step (step.order)}
						<div class="rounded-lg border p-3 hover:bg-muted/20 transition-colors">
							<div class="flex items-center gap-2 mb-1.5">
								<span class="bg-primary/10 text-primary text-[10px] font-bold rounded-full h-5 w-5 flex items-center justify-center shrink-0">{step.order}</span>
								<span class="text-xs font-medium text-muted-foreground">{m.tc_detail_action()}</span>
							</div>
							<p class="text-sm pl-7">{step.action}</p>
							{#if step.expected}
								<div class="mt-2 pl-7 border-l-2 border-muted ml-2.5">
									<span class="text-xs text-muted-foreground">{m.tc_detail_expected()}</span>
									<p class="text-sm">{step.expected}</p>
								</div>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/if}

	{#if expectedResult}
		<div class="space-y-1.5">
			<div class="flex items-center gap-1.5">
				<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
				<h4 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{m.tc_expected_result()}</h4>
			</div>
			<div class="bg-green-50 dark:bg-green-950/20 rounded-lg p-3 border border-green-200/50 dark:border-green-800/30">
				<p class="whitespace-pre-wrap text-sm leading-relaxed">{expectedResult}</p>
			</div>
		</div>
	{/if}

	<!-- Automation Key -->
	{#if automationKey}
		<div class="space-y-1.5">
			<div class="flex items-center gap-1.5">
				<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
				<h4 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{m.tc_automation_key_label()}</h4>
			</div>
			<p class="text-sm font-mono bg-muted/40 rounded-lg px-3 py-2">{automationKey}</p>
		</div>
	{/if}

	{#if !hasContent}
		<div class="text-center py-8">
			<p class="text-muted-foreground text-sm">{m.common_no_results()}</p>
			{#if canEdit}
				<Button variant="outline" size="sm" class="mt-3" onclick={onstartedit}>{m.common_edit()}</Button>
			{/if}
		</div>
	{/if}
</div>
