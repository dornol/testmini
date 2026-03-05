<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import { zodClient } from 'sveltekit-superforms/adapters';
	import { createTestCaseSchema } from '$lib/schemas/test-case.schema';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import StepsEditor from '$lib/components/StepsEditor.svelte';
	import * as Select from '$lib/components/ui/select/index.js';
	import TemplateSelector from '../TemplateSelector.svelte';
	import * as m from '$lib/paraglide/messages.js';

	let { data } = $props();

	// @ts-ignore zod 3.24 type mismatch with superforms adapter
	const validators = zodClient(createTestCaseSchema);
	const { form, errors, enhance, submitting } = superForm(data.form, {
		validators,
		dataType: 'json'
	});

	interface Template {
		id: number;
		name: string;
		precondition: string | null;
		steps: { order: number; action: string; expected: string }[];
		priority: string;
	}

	function applyTemplate(template: Template) {
		$form.precondition = template.precondition ?? '';
		// @ts-ignore zod 3.24 type mismatch
		$form.steps = template.steps.map((s) => ({ action: s.action, expected: s.expected }));
		$form.priority = template.priority as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
	}
</script>

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
							{$form.priority === 'LOW' ? m.priority_low() : $form.priority === 'MEDIUM' ? m.priority_medium() : $form.priority === 'HIGH' ? m.priority_high() : m.priority_critical()}
						</Select.Trigger>
						<Select.Content>
							<Select.Item value="LOW" label={m.priority_low()} />
							<Select.Item value="MEDIUM" label={m.priority_medium()} />
							<Select.Item value="HIGH" label={m.priority_high()} />
							<Select.Item value="CRITICAL" label={m.priority_critical()} />
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

				<StepsEditor
					value={($form.steps ?? []) as { action: string; expected: string }[]}
					onchange={(s) => {
						// @ts-ignore zod 3.24 type mismatch
						$form.steps = s;
					}}
				/>

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
