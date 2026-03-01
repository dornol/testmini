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
			class="text-muted-foreground hover:text-foreground text-sm">&larr; Back to Test Cases</a
		>
	</div>

	<Card.Root>
		<Card.Header>
			<Card.Title class="text-2xl">New Test Case</Card.Title>
			<Card.Description>Create a new test case with steps and expected results</Card.Description>
		</Card.Header>
		<Card.Content>
			<form method="POST" use:enhance class="space-y-6">
				<div class="space-y-2">
					<Label for="title">Title</Label>
					<Input id="title" name="title" bind:value={$form.title} placeholder="Test case title" />
					{#if $errors.title}
						<p class="text-destructive text-sm">{$errors.title}</p>
					{/if}
				</div>

				<div class="space-y-2">
					<Label for="priority">Priority</Label>
					<select
						id="priority"
						name="priority"
						bind:value={$form.priority}
						class="border-input bg-background ring-offset-background focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
					>
						<option value="LOW">Low</option>
						<option value="MEDIUM">Medium</option>
						<option value="HIGH">High</option>
						<option value="CRITICAL">Critical</option>
					</select>
				</div>

				<div class="space-y-2">
					<Label for="precondition">Precondition</Label>
					<Textarea
						id="precondition"
						name="precondition"
						value={$form.precondition as string}
						oninput={(e) => {
							$form.precondition = e.currentTarget.value;
						}}
						placeholder="Prerequisites or initial conditions..."
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
					<Label for="expectedResult">Overall Expected Result</Label>
					<Textarea
						id="expectedResult"
						name="expectedResult"
						value={$form.expectedResult as string}
						oninput={(e) => {
							$form.expectedResult = e.currentTarget.value;
						}}
						placeholder="The overall expected outcome..."
						rows={3}
					/>
				</div>

				<div class="flex gap-3 pt-2">
					<Button type="submit" disabled={$submitting}>
						{$submitting ? 'Creating...' : 'Create Test Case'}
					</Button>
					<Button variant="outline" href="/projects/{data.project.id}/test-cases">Cancel</Button>
				</div>
			</form>
		</Card.Content>
	</Card.Root>
</div>
