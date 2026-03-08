<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import { createTestCaseSchema } from '$lib/schemas/test-case.schema';
	import { zodValidators } from '$lib/form-utils';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import StepsEditor from '$lib/components/StepsEditor.svelte';
	import GherkinEditor from '$lib/components/GherkinEditor.svelte';
	import * as Select from '$lib/components/ui/select/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import { parseGherkin, stepsToGherkin, stepsToGherkinSteps, gherkinStepsToSteps } from '$lib/gherkin-parser';
	import TemplateSelector from '../TemplateSelector.svelte';
	import UnsavedChangesGuard from '$lib/components/UnsavedChangesGuard.svelte';
	import PriorityBadge from '$lib/components/PriorityBadge.svelte';
	import * as m from '$lib/paraglide/messages.js';

	let { data } = $props();
	let formDirty = $state(false);

	const validators = zodValidators(createTestCaseSchema);
	const { form, errors, enhance, submitting, tainted } = superForm(data.form, {
		validators,
		dataType: 'json',
		onUpdated() {
			formDirty = false;
		}
	});

	$effect(() => {
		formDirty = !!$tainted;
	});

	let gherkinText = $state('');

	function handleFormatChange(format: string) {
		const currentSteps = ($form.steps ?? []) as { action: string; expected: string }[];

		if (format === 'GHERKIN') {
			const gSteps = stepsToGherkinSteps(currentSteps);
			gherkinText = stepsToGherkin(gSteps);
			$form.stepFormat = 'GHERKIN';
		} else {
			if (gherkinText.trim()) {
				const parsed = parseGherkin(gherkinText);
				$form.steps = gherkinStepsToSteps(parsed);
			}
			$form.stepFormat = 'STEPS';
		}
	}

	interface Template {
		id: number;
		name: string;
		precondition: string | null;
		steps: { order: number; action: string; expected: string }[];
		priority: string;
	}

	function applyTemplate(template: Template) {
		$form.precondition = template.precondition ?? '';
		$form.steps = template.steps.map((s) => ({ action: s.action, expected: s.expected }));
		$form.priority = template.priority;
	}
</script>

<UnsavedChangesGuard dirty={formDirty && !$submitting} />

<div class="mx-auto max-w-2xl">
	<div class="mb-4">
		<a
			href="/projects/{data.project.id}/test-cases"
			class="text-muted-foreground hover:text-foreground text-sm">&larr; {m.common_back_to({ target: m.tc_title() })}</a
		>
	</div>

	<Card.Root>
		<Card.Header>
			<div class="flex items-start justify-between">
				<div>
					<Card.Title class="text-xl">{m.tc_new_title()}</Card.Title>
					<Card.Description>{m.tc_new_desc()}</Card.Description>
				</div>
				<TemplateSelector projectId={data.project.id} onApply={applyTemplate} />
			</div>
		</Card.Header>
		<Card.Content>
			<form method="POST" use:enhance class="space-y-4">
				<div class="space-y-2">
					<Label for="title">{m.tc_title_label()}</Label>
					<Input id="title" name="title" bind:value={$form.title} placeholder={m.tc_title_placeholder()} />
					{#if $errors.title}
						<p class="text-destructive text-sm">{$errors.title}</p>
					{/if}
				</div>

				<div class="space-y-2">
					<Label for="priority">{m.common_priority()}</Label>
					<input type="hidden" name="priority" value={$form.priority} />
					<Select.Root
						type="single"
						value={$form.priority as string}
						onValueChange={(v: string) => { $form.priority = v; }}
					>
						<Select.Trigger class="w-full">
							{$form.priority}
						</Select.Trigger>
						<Select.Content>
							{#each data.projectPriorities as p (p.id)}
								<Select.Item value={p.name} label={p.name}>
									<PriorityBadge name={p.name} color={p.color} />
								</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
				</div>

				<div class="space-y-2">
					<Label for="precondition">{m.tc_precondition()}</Label>
					<Textarea
						id="precondition"
						name="precondition"
						value={$form.precondition as string}
						oninput={(e) => {
							$form.precondition = e.currentTarget.value;
						}}
						placeholder={m.tc_precondition_placeholder()}
						rows={3}
					/>
				</div>

				<div class="space-y-3">
					<Tabs.Root
						value={($form.stepFormat as string) ?? 'STEPS'}
						onValueChange={handleFormatChange}
					>
						<Tabs.List class="w-fit">
							<Tabs.Trigger value="STEPS">{m.step_format_steps()}</Tabs.Trigger>
							<Tabs.Trigger value="GHERKIN">{m.step_format_gherkin()}</Tabs.Trigger>
						</Tabs.List>
					</Tabs.Root>

					{#if $form.stepFormat === 'GHERKIN'}
						<GherkinEditor
							value={gherkinText}
							onchange={(text) => {
								gherkinText = text;
								const parsed = parseGherkin(text);
								$form.steps = gherkinStepsToSteps(parsed);
							}}
						/>
					{:else}
						<StepsEditor
							value={($form.steps ?? []) as { action: string; expected: string }[]}
							onchange={(s) => {
								$form.steps = s;
							}}
						/>
					{/if}
				</div>

				<div class="space-y-2">
					<Label for="expectedResult">{m.tc_expected_result()}</Label>
					<Textarea
						id="expectedResult"
						name="expectedResult"
						value={$form.expectedResult as string}
						oninput={(e) => {
							$form.expectedResult = e.currentTarget.value;
						}}
						placeholder={m.tc_expected_result_placeholder()}
						rows={3}
					/>
				</div>

				<div class="space-y-2">
					<Label for="automationKey">{m.tc_automation_key_label()}</Label>
					<Input
						id="automationKey"
						name="automationKey"
						bind:value={$form.automationKey}
						placeholder={m.tc_automation_key_placeholder()}
					/>
					{#if $errors.automationKey}
						<p class="text-destructive text-sm">{$errors.automationKey}</p>
					{/if}
				</div>

				<div class="flex gap-3 pt-2">
					<Button type="submit" disabled={$submitting}>
						{$submitting ? m.common_creating() : m.tc_create()}
					</Button>
					<Button variant="outline" href="/projects/{data.project.id}/test-cases">{m.common_cancel()}</Button>
				</div>
			</form>
		</Card.Content>
	</Card.Root>
</div>
