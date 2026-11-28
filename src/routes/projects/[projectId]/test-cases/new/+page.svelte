<script lang="ts">
	import FormErrorSummary from '$lib/components/patterns/FormErrorSummary.svelte';
	import {
		testCaseFieldTarget,
		localizeTestCaseErrors,
		testCaseErrorMessage
	} from '$lib/test-case-form';
	import { tick } from 'svelte';
	let errorSummary = $state<HTMLDivElement | null>(null);
	import { superForm } from 'sveltekit-superforms';
	import { lazyZodValidators } from '$lib/form-utils';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import StepsEditor from '$lib/components/StepsEditor.svelte';
	import GherkinEditor from '$lib/components/GherkinEditor.svelte';
	import * as Select from '$lib/components/ui/select/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import {
		parseGherkin,
		stepsToGherkin,
		stepsToGherkinSteps,
		gherkinStepsToSteps
	} from '$lib/gherkin-parser';
	import TemplateSelector from '../TemplateSelector.svelte';
	import UnsavedChangesGuard from '$lib/components/UnsavedChangesGuard.svelte';
	import PriorityBadge from '$lib/components/PriorityBadge.svelte';
	import * as m from '$lib/paraglide/messages.js';

	let { data } = $props();
	let formDirty = $state(false);

	const validators = lazyZodValidators(() =>
		import('$lib/schemas/test-case.schema').then((module) => module.createTestCaseSchema)
	);
	const { form, errors, allErrors, enhance, submitting, tainted } = superForm(
		// svelte-ignore state_referenced_locally
		data.form,
		{
			validators,
			dataType: 'json',
			// The linked summary owns post-submit focus; avoid competing field autofocus.
			autoFocusOnError: false,
			scrollToError: 'off',
			async onUpdated({ form }) {
				if (form.valid) formDirty = false;
				else {
					await tick();
					errorSummary?.focus();
				}
			}
		}
	);

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

	const customFieldDefs = $derived(data.customFieldDefs ?? []);

	function getCustomFieldFormValues(): Record<string, unknown> {
		return ($form.customFields ?? {}) as Record<string, unknown>;
	}

	function setCustomFieldValue(key: string, value: unknown) {
		const current = getCustomFieldFormValues();
		current[key] = value;
		($form as Record<string, unknown>).customFields = { ...current };
	}

	function getCustomFieldValue(key: string): unknown {
		return getCustomFieldFormValues()[key];
	}
</script>

<UnsavedChangesGuard dirty={formDirty && !$submitting} />

<div class="mx-auto max-w-2xl">
	<div class="mb-4">
		<a
			href="/projects/{data.project.id}/test-cases"
			class="text-muted-foreground hover:text-foreground text-sm"
			>&larr; {m.common_back_to({ target: m.tc_title() })}</a
		>
	</div>

	<Card.Root>
		<Card.Header>
			<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
				<div class="min-w-0">
					<h2 class="text-xl font-semibold tracking-tight">{m.tc_new_title()}</h2>
					<Card.Description>{m.tc_new_desc()}</Card.Description>
				</div>
				<TemplateSelector projectId={data.project.id} onApply={applyTemplate} />
			</div>
		</Card.Header>
		<Card.Content>
			<form method="POST" use:enhance class="space-y-4">
				<FormErrorSummary
					errors={localizeTestCaseErrors($allErrors)}
					fieldTarget={(path) =>
						$form.stepFormat === 'GHERKIN' && path.startsWith('steps[')
							? 'gherkin-input'
							: testCaseFieldTarget(path)}
					bind:ref={errorSummary}
				/>
				<div class="space-y-2">
					<Label for="title"
						>{m.tc_title_label()}
						<span class="text-muted-foreground text-xs">({m.ui_required()})</span></Label
					>
					<Input
						id="title"
						name="title"
						bind:value={$form.title}
						placeholder={m.tc_title_placeholder()}
						aria-invalid={!!$errors.title}
						aria-describedby={$errors.title ? 'title-error' : undefined}
					/>
					{#if $errors.title}
						<p id="title-error" class="text-destructive text-sm">
							{testCaseErrorMessage('title', $errors.title)}
						</p>
					{/if}
				</div>

				<div class="space-y-2">
					<Label for="priority">{m.common_priority()}</Label>
					<input type="hidden" name="priority" value={$form.priority} />
					<Select.Root
						type="single"
						value={$form.priority as string}
						onValueChange={(v: string) => {
							$form.priority = v;
						}}
					>
						<Select.Trigger
							id="priority"
							class="w-full"
							aria-invalid={!!$errors.priority}
							aria-describedby={$errors.priority ? 'priority-error' : undefined}
						>
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
					{#if $errors.priority}<p id="priority-error" class="text-destructive text-sm">
							{testCaseErrorMessage('priority', $errors.priority)}
						</p>{/if}
				</div>

				<div class="space-y-2">
					<Label for="precondition">{m.tc_precondition()}</Label>
					<Textarea
						id="precondition"
						aria-invalid={!!$errors.precondition}
						aria-describedby={$errors.precondition ? 'precondition-error' : undefined}
						name="precondition"
						value={$form.precondition as string}
						oninput={(e) => {
							$form.precondition = e.currentTarget.value;
						}}
						placeholder={m.tc_precondition_placeholder()}
						rows={3}
					/>
					{#if $errors.precondition}<p id="precondition-error" class="text-destructive text-sm">
							{testCaseErrorMessage('precondition', $errors.precondition)}
						</p>{/if}
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
							id="gherkin-input"
							value={gherkinText}
							onchange={(text) => {
								gherkinText = text;
								const parsed = parseGherkin(text);
								$form.steps = gherkinStepsToSteps(parsed);
							}}
						/>
					{:else}
						<StepsEditor
							errors={localizeTestCaseErrors($allErrors)}
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
						aria-invalid={!!$errors.expectedResult}
						aria-describedby={$errors.expectedResult ? 'expectedResult-error' : undefined}
						name="expectedResult"
						value={$form.expectedResult as string}
						oninput={(e) => {
							$form.expectedResult = e.currentTarget.value;
						}}
						placeholder={m.tc_expected_result_placeholder()}
						rows={3}
					/>
					{#if $errors.expectedResult}<p id="expectedResult-error" class="text-destructive text-sm">
							{testCaseErrorMessage('expectedResult', $errors.expectedResult)}
						</p>{/if}
				</div>

				{#if customFieldDefs.length > 0}
					<div class="space-y-3 border-t pt-4">
						<h4 class="text-sm font-medium">{m.custom_field_title()}</h4>
						{#each customFieldDefs as cf (cf.id)}
							{@const fieldKey = String(cf.id)}
							<div class="space-y-1">
								<Label for="cf-{cf.id}">
									{cf.name}
									{#if cf.required}<span class="text-destructive">*</span>{/if}
								</Label>
								{#if cf.fieldType === 'TEXT'}
									<Input
										id="cf-{cf.id}"
										value={(getCustomFieldValue(fieldKey) as string) ?? ''}
										oninput={(e) => setCustomFieldValue(fieldKey, e.currentTarget.value)}
									/>
								{:else if cf.fieldType === 'NUMBER'}
									<Input
										id="cf-{cf.id}"
										type="number"
										value={(getCustomFieldValue(fieldKey) as string) ?? ''}
										oninput={(e) => {
											const v = e.currentTarget.value;
											setCustomFieldValue(fieldKey, v === '' ? null : Number(v));
										}}
									/>
								{:else if cf.fieldType === 'DATE'}
									<Input
										id="cf-{cf.id}"
										type="date"
										value={(getCustomFieldValue(fieldKey) as string) ?? ''}
										oninput={(e) => setCustomFieldValue(fieldKey, e.currentTarget.value || null)}
									/>
								{:else if cf.fieldType === 'URL'}
									<Input
										id="cf-{cf.id}"
										type="url"
										value={(getCustomFieldValue(fieldKey) as string) ?? ''}
										placeholder="https://..."
										oninput={(e) => setCustomFieldValue(fieldKey, e.currentTarget.value || null)}
									/>
								{:else if cf.fieldType === 'CHECKBOX'}
									<div class="flex items-center gap-2">
										<Checkbox
											id="cf-{cf.id}"
											checked={!!getCustomFieldValue(fieldKey)}
											onCheckedChange={(checked) => setCustomFieldValue(fieldKey, !!checked)}
										/>
									</div>
								{:else if cf.fieldType === 'SELECT'}
									<Select.Root
										type="single"
										value={(getCustomFieldValue(fieldKey) as string) ?? ''}
										onValueChange={(v) => setCustomFieldValue(fieldKey, v || null)}
									>
										<Select.Trigger id="cf-{cf.id}" class="w-full">
											{(getCustomFieldValue(fieldKey) as string) || '-'}
										</Select.Trigger>
										<Select.Content>
											{#each cf.options ?? [] as opt (opt)}
												<Select.Item value={opt} label={opt} />
											{/each}
										</Select.Content>
									</Select.Root>
								{:else if cf.fieldType === 'MULTISELECT'}
									{@const selected = (getCustomFieldValue(fieldKey) ?? []) as string[]}
									<div class="flex flex-wrap gap-2">
										{#each cf.options ?? [] as opt (opt)}
											<label class="inline-flex items-center gap-1.5 text-sm cursor-pointer">
												<Checkbox
													checked={selected.includes(opt)}
													onCheckedChange={(checked) => {
														const cur = (getCustomFieldValue(fieldKey) ?? []) as string[];
														if (checked) {
															setCustomFieldValue(fieldKey, [...cur, opt]);
														} else {
															setCustomFieldValue(
																fieldKey,
																cur.filter((v) => v !== opt)
															);
														}
													}}
												/>
												{opt}
											</label>
										{/each}
									</div>
								{/if}
							</div>
						{/each}
					</div>
				{/if}

				<div class="space-y-2">
					<Label for="automationKey">{m.tc_automation_key_label()}</Label>
					<Input
						id="automationKey"
						name="automationKey"
						bind:value={$form.automationKey}
						placeholder={m.tc_automation_key_placeholder()}
						aria-invalid={!!$errors.automationKey}
						aria-describedby={$errors.automationKey ? 'automationKey-error' : undefined}
					/>
					{#if $errors.automationKey}
						<p id="automationKey-error" class="text-destructive text-sm">
							{testCaseErrorMessage('automationKey', $errors.automationKey)}
						</p>
					{/if}
				</div>

				<div class="flex flex-col gap-2 pt-2 sm:flex-row sm:gap-3">
					<Button type="submit" class="w-full sm:w-auto" disabled={$submitting}>
						{$submitting ? m.common_creating() : m.tc_create()}
					</Button>
					<Button
						variant="outline"
						class="w-full sm:w-auto"
						href="/projects/{data.project.id}/test-cases">{m.common_cancel()}</Button
					>
				</div>
			</form>
		</Card.Content>
	</Card.Root>
</div>
