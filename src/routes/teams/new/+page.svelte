<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import { createTeamSchema } from '$lib/schemas/team.schema';
	import { zodValidators } from '$lib/form-utils';
	import * as m from '$lib/paraglide/messages.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';

	let { data } = $props();

	const validators = zodValidators(createTeamSchema);
	const { form, errors, enhance, submitting } = superForm(
		// svelte-ignore state_referenced_locally
		data.form,
		{ validators }
	);

	function validationMessage(error: string | string[] | undefined): string {
		const message = Array.isArray(error) ? error[0] : error;
		if (!message) return '';
		if (message.includes('expected string to have >=1 characters')) {
			return m.validation_team_name_required();
		}
		if (message.includes('expected string to have <=100 characters')) {
			return m.validation_name_max_100();
		}
		if (message.includes('expected string to have <=1000 characters')) {
			return m.validation_description_max_1000();
		}
		return message;
	}
</script>

<div class="mx-auto max-w-lg">
	<div class="mb-4">
		<a
			href="/teams"
			class="text-muted-foreground hover:text-foreground inline-flex min-h-8 items-center text-sm"
			>&larr; {m.common_back_to({ target: m.nav_teams() })}</a
		>
	</div>

	<Card.Root>
		<Card.Header>
			<Card.Title class="text-xl">{m.team_new()}</Card.Title>
			<Card.Description>{m.team_empty_create()}</Card.Description>
		</Card.Header>
		<Card.Content>
			<form method="POST" use:enhance class="space-y-4">
				<div class="space-y-2">
					<Label for="name">{m.team_name()}</Label>
					<Input id="name" name="name" bind:value={$form.name} placeholder={m.team_name()} />
					{#if $errors.name}
						<p class="text-destructive text-sm">{validationMessage($errors.name)}</p>
					{/if}
				</div>

				<div class="space-y-2">
					<Label for="description">{m.team_desc()}</Label>
					<Textarea
						id="description"
						name="description"
						value={$form.description as string}
						oninput={(e) => {
							$form.description = e.currentTarget.value;
						}}
						placeholder={m.team_desc()}
						rows={4}
					/>
					{#if $errors.description}
						<p class="text-destructive text-sm">{validationMessage($errors.description)}</p>
					{/if}
				</div>

				<div class="flex flex-col gap-2 pt-2 sm:flex-row sm:gap-3">
					<Button type="submit" disabled={$submitting}>
						{$submitting ? m.common_creating() : m.team_create()}
					</Button>
					<Button variant="outline" href="/teams">{m.common_cancel()}</Button>
				</div>
			</form>
		</Card.Content>
	</Card.Root>
</div>
