<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import { zodClient } from 'sveltekit-superforms/adapters';
	import { createProjectSchema } from '$lib/schemas/project.schema';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';

	let { data } = $props();

	// @ts-ignore zod 3.24 type mismatch with superforms adapter
	const validators = zodClient(createProjectSchema);
	const { form, errors, enhance, submitting } = superForm(data.form, { validators });
</script>

<div class="mx-auto max-w-lg">
	<div class="mb-6">
		<a href="/projects" class="text-muted-foreground hover:text-foreground text-sm">&larr; Back to Projects</a>
	</div>

	<Card.Root>
		<Card.Header>
			<Card.Title class="text-2xl">New Project</Card.Title>
			<Card.Description>Create a new project to organize your test cases</Card.Description>
		</Card.Header>
		<Card.Content>
			<form method="POST" use:enhance class="space-y-4">
				<div class="space-y-2">
					<Label for="name">Project Name</Label>
					<Input id="name" name="name" bind:value={$form.name} placeholder="My Project" />
					{#if $errors.name}
						<p class="text-destructive text-sm">{$errors.name}</p>
					{/if}
				</div>

				<div class="space-y-2">
					<Label for="description">Description</Label>
					<Textarea
						id="description"
						name="description"
						value={$form.description as string}
						oninput={(e) => { $form.description = e.currentTarget.value; }}
						placeholder="Describe what this project is about..."
						rows={4}
					/>
					{#if $errors.description}
						<p class="text-destructive text-sm">{$errors.description}</p>
					{/if}
				</div>

				<div class="flex gap-3 pt-2">
					<Button type="submit" disabled={$submitting}>
						{$submitting ? 'Creating...' : 'Create Project'}
					</Button>
					<Button variant="outline" href="/projects">Cancel</Button>
				</div>
			</form>
		</Card.Content>
	</Card.Root>
</div>
