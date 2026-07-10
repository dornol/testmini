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
		data.form,
		{ validators }
	);

	function validationMessage(error: string | string[] | undefined): string {
		const message = Array.isArray(error) ? error[0] : error;
		if (!message) return '';
		if (message === 'Project name is required') return m.validation_project_name_required();
		if (message === 'Name must be 100 characters or less') return m.validation_name_max_100();
		if (message === 'Description must be 1000 characters or less') {
			return m.validation_description_max_1000();
		}
		return message;
	}
</script>

<div class="mx-auto max-w-lg">
	<div class="mb-4">
		<a
			href="/projects"
			class="text-muted-foreground hover:text-foreground inline-flex min-h-8 items-center text-sm"
			>&larr; {m.common_back_to({ target: m.nav_projects() })}</a
		>
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
					<Input
						id="name"
						name="name"
						bind:value={$form.name}
						placeholder={m.project_name_placeholder()}
					/>
					{#if $errors.name}
						<p class="text-destructive text-sm">{validationMessage($errors.name)}</p>
					{/if}
				</div>

				<div class="space-y-2">
					<Label for="description">{m.common_description()}</Label>
					<Textarea
						id="description"
						name="description"
						value={$form.description as string}
						oninput={(e) => {
							$form.description = e.currentTarget.value;
						}}
						placeholder={m.project_desc_placeholder()}
						rows={4}
					/>
					{#if $errors.description}
						<p class="text-destructive text-sm">{validationMessage($errors.description)}</p>
					{/if}
				</div>

				<div class="flex flex-col gap-2 pt-2 sm:flex-row sm:gap-3">
					<Button type="submit" disabled={$submitting}>
						{$submitting ? m.common_creating() : m.projects_create()}
					</Button>
					<Button variant="outline" href="/projects">{m.common_cancel()}</Button>
				</div>
			</form>
		</Card.Content>
	</Card.Root>
</div>
