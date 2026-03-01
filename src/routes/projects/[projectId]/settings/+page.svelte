<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import { zodClient } from 'sveltekit-superforms/adapters';
	import { updateProjectSchema } from '$lib/schemas/project.schema';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { toast } from 'svelte-sonner';
	import * as m from '$lib/paraglide/messages.js';

	let { data } = $props();

	// @ts-ignore zod 3.24 type mismatch with superforms adapter
	const validators = zodClient(updateProjectSchema);
	const { form, errors, enhance, submitting } = superForm(data.form, {
		validators,
		onUpdated({ form }) {
			if (form.message) {
				toast.success(form.message);
			}
		}
	});

	let deactivateOpen = $state(false);
</script>

<div class="space-y-8">
	<Card.Root>
		<Card.Header>
			<Card.Title>{m.settings_general()}</Card.Title>
			<Card.Description>{m.settings_general_desc()}</Card.Description>
		</Card.Header>
		<Card.Content>
			<form method="POST" action="?/update" use:enhance class="space-y-4">
				<div class="space-y-2">
					<Label for="name">{m.project_name_label()}</Label>
					<Input id="name" name="name" bind:value={$form.name} />
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
						rows={4}
					/>
					{#if $errors.description}
						<p class="text-destructive text-sm">{$errors.description}</p>
					{/if}
				</div>

				<Button type="submit" disabled={$submitting}>
					{$submitting ? m.common_saving() : m.common_save_changes()}
				</Button>
			</form>
		</Card.Content>
	</Card.Root>

	{#if data.project.active}
		<Card.Root class="border-destructive">
			<Card.Header>
				<Card.Title class="text-destructive">{m.settings_danger_zone()}</Card.Title>
				<Card.Description>
					{m.settings_deactivate_desc()}
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<AlertDialog.Root bind:open={deactivateOpen}>
					<AlertDialog.Trigger>
						{#snippet child({ props })}
							<Button variant="destructive" {...props}>{m.settings_deactivate()}</Button>
						{/snippet}
					</AlertDialog.Trigger>
					<AlertDialog.Portal>
						<AlertDialog.Overlay />
						<AlertDialog.Content>
							<AlertDialog.Header>
								<AlertDialog.Title>{m.settings_deactivate_title()}</AlertDialog.Title>
								<AlertDialog.Description>
									{m.settings_deactivate_confirm({ name: data.project.name })}
								</AlertDialog.Description>
							</AlertDialog.Header>
							<AlertDialog.Footer>
								<AlertDialog.Cancel>{m.common_cancel()}</AlertDialog.Cancel>
								<form method="POST" action="?/deactivate">
									<Button type="submit" variant="destructive">{m.settings_deactivate()}</Button>
								</form>
							</AlertDialog.Footer>
						</AlertDialog.Content>
					</AlertDialog.Portal>
				</AlertDialog.Root>
			</Card.Content>
		</Card.Root>
	{/if}
</div>
