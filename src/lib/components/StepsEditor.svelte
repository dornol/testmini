<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';

	type Step = { id?: string; action: string; expected: string };

	let {
		value = [],
		onchange,
		disabled = false
	}: {
		value: Step[];
		onchange: (steps: Step[]) => void;
		disabled?: boolean;
	} = $props();

	let counter = 0;
	function genId() {
		return `step-${Date.now()}-${counter++}`;
	}

	function addStep() {
		onchange([...value, { id: genId(), action: '', expected: '' }]);
	}

	function removeStep(index: number) {
		onchange(value.filter((_, i) => i !== index));
	}

	function moveStep(index: number, direction: -1 | 1) {
		const newIndex = index + direction;
		if (newIndex < 0 || newIndex >= value.length) return;
		const newSteps = [...value];
		[newSteps[index], newSteps[newIndex]] = [newSteps[newIndex], newSteps[index]];
		onchange(newSteps);
	}

	function updateStep(index: number, field: 'action' | 'expected', val: string) {
		const newSteps = value.map((s, i) => (i === index ? { ...s, [field]: val } : s));
		onchange(newSteps);
	}
</script>

<div class="space-y-3">
	<div class="flex items-center justify-between">
		<Label>{m.steps_editor_title()}</Label>
		{#if !disabled}
			<Button type="button" variant="outline" size="sm" onclick={addStep}>{m.steps_editor_add()}</Button>
		{/if}
	</div>

	{#if value.length === 0}
		<p class="text-muted-foreground text-sm">{m.common_no_results()}</p>
	{:else}
		<div class="space-y-3">
			{#each value as step, i (i)}
				<div class="rounded-md border p-3">
					<div class="mb-2 flex items-center justify-between">
						<span class="text-muted-foreground text-sm font-medium">{m.steps_editor_step_n({ n: i + 1 })}</span>
						{#if !disabled}
							<div class="flex items-center gap-1">
								<Button
									type="button"
									variant="ghost"
									size="sm"
									disabled={i === 0}
									onclick={() => moveStep(i, -1)}
									class="h-7 w-7 p-0"
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										width="14"
										height="14"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
									>
										<path d="m18 15-6-6-6 6" />
									</svg>
								</Button>
								<Button
									type="button"
									variant="ghost"
									size="sm"
									disabled={i === value.length - 1}
									onclick={() => moveStep(i, 1)}
									class="h-7 w-7 p-0"
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										width="14"
										height="14"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
									>
										<path d="m6 9 6 6 6-6" />
									</svg>
								</Button>
								<Button
									type="button"
									variant="ghost"
									size="sm"
									onclick={() => removeStep(i)}
									class="text-destructive hover:text-destructive h-7 w-7 p-0"
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										width="14"
										height="14"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
									>
										<path d="M18 6 6 18" />
										<path d="m6 6 12 12" />
									</svg>
								</Button>
							</div>
						{/if}
					</div>
					<div class="grid gap-3 sm:grid-cols-2">
						<div class="space-y-1">
							<label for="step-action-{i}" class="text-muted-foreground text-xs">{m.steps_editor_action()}</label>
							<Input
								id="step-action-{i}"
								placeholder={m.steps_editor_action_placeholder()}
								value={step.action}
								oninput={(e) => updateStep(i, 'action', e.currentTarget.value)}
								{disabled}
							/>
						</div>
						<div class="space-y-1">
							<label for="step-expected-{i}" class="text-muted-foreground text-xs"
								>{m.steps_editor_expected()}</label
							>
							<Input
								id="step-expected-{i}"
								placeholder={m.steps_editor_expected_placeholder()}
								value={step.expected}
								oninput={(e) => updateStep(i, 'expected', e.currentTarget.value)}
								{disabled}
							/>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
