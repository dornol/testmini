<script lang="ts">
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { parseGherkin, stepsToGherkin, type GherkinStep } from '$lib/gherkin-parser';
	import * as m from '$lib/paraglide/messages.js';

	let {
		value = '',
		onchange,
		disabled = false
	}: {
		value: string;
		onchange: (text: string) => void;
		disabled?: boolean;
	} = $props();

	const parsedSteps = $derived(parseGherkin(value));

	function handleInput(e: Event & { currentTarget: HTMLTextAreaElement }) {
		onchange(e.currentTarget.value);
	}

	function keywordClass(keyword: string): string {
		switch (keyword) {
			case 'Given':
				return 'text-blue-600 dark:text-blue-400';
			case 'When':
				return 'text-amber-600 dark:text-amber-400';
			case 'Then':
				return 'text-green-600 dark:text-green-400';
			case 'And':
			case 'But':
				return 'text-purple-600 dark:text-purple-400';
			default:
				return '';
		}
	}
</script>

<div class="space-y-3">
	<div>
		<Label>{m.gherkin_editor_title()}</Label>
		<p class="text-muted-foreground text-xs mt-1">{m.gherkin_editor_hint()}</p>
	</div>

	<Textarea
		class="font-mono text-sm min-h-[160px]"
		placeholder={m.gherkin_editor_placeholder()}
		{value}
		oninput={handleInput}
		{disabled}
		rows={8}
	/>

	{#if parsedSteps.length > 0}
		<div>
			<Label class="text-xs text-muted-foreground">{m.gherkin_preview_title()} ({parsedSteps.length})</Label>
			<div class="mt-1 space-y-1 rounded-md border p-3 bg-muted/30">
				{#each parsedSteps as step, i (i)}
					<div class="text-sm">
						<span class="font-bold {keywordClass(step.keyword)}">{step.keyword}</span>
						<span class="ml-1">{step.text}</span>
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>
