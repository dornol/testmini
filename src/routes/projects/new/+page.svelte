<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import { createProjectSchema } from '$lib/schemas/project.schema';
	import { zodValidators } from '$lib/form-utils';
	import * as m from '$lib/paraglide/messages.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';

	let { data } = $props();

	const validators = zodValidators(createProjectSchema);
	const { form, errors, enhance, submitting } = superForm(
		// svelte-ignore state_referenced_locally
		data.form, { validators });
</script>

<div class="mx-auto max-w-lg">
	<div class="mb-4">
		<a href="/projects" class="text-muted-foreground hover:text-foreground text-sm">&larr; {m.common_back_to({ target: m.nav_projects() })}</a>
	</div>

	<Card.Root>
		<Card.Header>
			<Card.Title class="text-xl">{m.project_new_title()}</Card.Title>
			<Card.Description>{m.project_new_desc()}</Card.Description>
		</Card.Header>
		<Card.Content>
			<form method="POST" use:enhance class="space-y-4">
				<div class="space-y-2">
					<Label for="name">{m.project_name_label()}</Label>
					<Input id="name" name="name" bind:value={$form.name} placeholder={m.project_name_placeholder()} />
					{#if $errors.name}
						<p class="text-destructive text-sm">{$errors.name}</p>
					{/if}
				</div>

				<div class="space-y-2">
					<Label for="description">{m.common_description()}</Label>
					<Textarea
						id="description"
						name="description"
						value={$form.description as string}
						oninput={(e) => { $form.description = e.currentTarget.value; }}
						placeholder={m.project_desc_placeholder()}
						rows={4}
					/>
					{#if $errors.description}
						<p class="text-destructive text-sm">{$errors.description}</p>
					{/if}
				</div>

				<div class="flex gap-3 pt-2">
					<Button type="submit" disabled={$submitting}>
						{$submitting ? m.common_creating() : m.projects_create()}
					</Button>
					<Button variant="outline" href="/projects">{m.common_cancel()}</Button>
				</div>
			</form>
		</Card.Content>
	</Card.Root>
</div>
