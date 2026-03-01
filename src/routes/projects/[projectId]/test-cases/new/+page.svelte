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
	import * as m from '$lib/paraglide/messages.js';

	let { data } = $props();

	// @ts-ignore zod 3.24 type mismatch with superforms adapter
	const validators = zodClient(createTestCaseSchema);
	const { form, errors, enhance, submitting } = superForm(data.form, {
		validators,
		dataType: 'json'
	});
</script>

<div class="mx-auto max-w-2xl">
	<div class="mb-6">
		<a
			href="/projects/{data.project.id}/test-cases"
			class="text-muted-foreground hover:text-foreground text-sm">&larr; {m.common_back_to({ target: m.tc_title() })}</a
		>
	</div>

	<Card.Root>
		<Card.Header>
			<Card.Title class="text-2xl">{m.tc_new_title()}</Card.Title>
			<Card.Description>{m.tc_new_desc()}</Card.Description>
		</Card.Header>
		<Card.Content>
			<form method="POST" use:enhance class="space-y-6">
				<div class="space-y-2">
					<Label for="title">{m.tc_title_label()}</Label>
					<Input id="title" name="title" bind:value={$form.title} placeholder={m.tc_title_placeholder()} />
					{#if $errors.title}
						<p class="text-destructive text-sm">{$errors.title}</p>
					{/if}
				</div>

				<div class="space-y-2">
					<Label for="priority">{m.common_priority()}</Label>
					<select
						id="priority"
						name="priority"
						bind:value={$form.priority}
						class="border-input bg-background ring-offset-background focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
					>
						<option value="LOW">{m.priority_low()}</option>
						<option value="MEDIUM">{m.priority_medium()}</option>
						<option value="HIGH">{m.priority_high()}</option>
						<option value="CRITICAL">{m.priority_critical()}</option>
					</select>
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
