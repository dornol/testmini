<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import { updateTeamSchema } from '$lib/schemas/team.schema';
	import { zodValidators } from '$lib/form-utils';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { toast } from 'svelte-sonner';
	import UnsavedChangesGuard from '$lib/components/UnsavedChangesGuard.svelte';
	import * as m from '$lib/paraglide/messages.js';

	let { data } = $props();

	const validators = zodValidators(updateTeamSchema);
	const { form, errors, enhance, submitting, tainted } = superForm(
		// svelte-ignore state_referenced_locally
		data.form, {
		validators,
		onUpdated({ form }) {
			if (form.message) {
				toast.success(m.team_updated());
			}
		}
	});

	let deleteOpen = $state(false);
</script>

<UnsavedChangesGuard dirty={!!$tainted && !$submitting} />

<div class="space-y-4">
	<Card.Root>
		<Card.Header>
			<Card.Title>{m.team_general()}</Card.Title>
		</Card.Header>
		<Card.Content>
			<form method="POST" action="?/update" use:enhance class="space-y-4">
				<div class="space-y-2">
					<Label for="name">{m.team_name()}</Label>
					<Input id="name" name="name" bind:value={$form.name} />
					{#if $errors.name}
						<p class="text-destructive text-sm">{$errors.name}</p>
					{/if}
				</div>

				<div class="space-y-2">
					<Label for="description">{m.team_desc()}</Label>
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

	{#if data.userTeamRole === 'OWNER'}
		<Card.Root class="border-destructive">
			<Card.Header>
				<Card.Title class="text-destructive">{m.settings_danger_zone()}</Card.Title>
				<Card.Description>
					{m.team_delete_confirm()}
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<AlertDialog.Root bind:open={deleteOpen}>
					<AlertDialog.Trigger>
						{#snippet child({ props })}
							<Button variant="destructive" {...props}>{m.team_delete_title()}</Button>
						{/snippet}
					</AlertDialog.Trigger>
					<AlertDialog.Portal>
						<AlertDialog.Overlay />
						<AlertDialog.Content>
							<AlertDialog.Header>
								<AlertDialog.Title>{m.team_delete_title()}</AlertDialog.Title>
								<AlertDialog.Description>
									{m.team_delete_confirm()}
								</AlertDialog.Description>
							</AlertDialog.Header>
							<AlertDialog.Footer>
								<AlertDialog.Cancel>{m.common_cancel()}</AlertDialog.Cancel>
								<form method="POST" action="?/delete">
									<Button type="submit" variant="destructive">{m.common_delete()}</Button>
								</form>
							</AlertDialog.Footer>
						</AlertDialog.Content>
					</AlertDialog.Portal>
				</AlertDialog.Root>
			</Card.Content>
		</Card.Root>
	{/if}
</div>
