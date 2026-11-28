<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { superForm, type SuperValidated } from 'sveltekit-superforms';
	import { lazyZodValidators } from '$lib/form-utils';
	import * as m from '$lib/paraglide/messages.js';
	import UnsavedChangesGuard from '$lib/components/UnsavedChangesGuard.svelte';
	import FormErrorSummary from '$lib/components/patterns/FormErrorSummary.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';

	let {
		initial,
		action,
		editing = false,
		guard = false,
		team = false
	}: {
		initial: SuperValidated<{ name: string; description?: string }>;
		action?: string;
		editing?: boolean;
		guard?: boolean;
		team?: boolean;
	} = $props();
	let summary = $state<HTMLDivElement | null>(null);
	let submitted = $state(false);

	async function focusSummary() {
		await tick();
		summary?.focus();
	}

	const { form, errors, constraints, message, enhance, submitting, tainted } = superForm(
		untrack(() => initial),
		{
			validators: lazyZodValidators(async () =>
				untrack(() => team)
					? (await import('$lib/schemas/team.schema')).createTeamSchema
					: (await import('$lib/schemas/project.schema')).createProjectSchema
			),
			autoFocusOnError: false,
			scrollToError: 'off',
			onSubmit: () => {
				submitted = true;
			},
			onUpdated: ({ form }) => {
				if (submitted && !form.valid) void focusSummary();
				submitted = false;
			},
			onError: () => {
				$message = 'save_failed';
				submitted = false;
				void focusSummary();
			}
		}
	);

	function validationMessage(error: string): string {
		if (error === 'Project name is required') return m.validation_project_name_required();
		if (error.includes('expected string to have >=1 characters'))
			return m.validation_team_name_required();
		if (error.includes('expected string to have <=100 characters'))
			return m.validation_name_max_100();
		if (error.includes('expected string to have <=1000 characters'))
			return m.validation_description_max_1000();
		if (error === 'Name must be 100 characters or less') return m.validation_name_max_100();
		if (error === 'Description must be 1000 characters or less')
			return m.validation_description_max_1000();
		return error;
	}

	const fieldErrors = $derived({
		name: $errors.name?.map(validationMessage) ?? [],
		description: $errors.description?.map(validationMessage) ?? []
	});
	const feedback = $derived([
		...Object.entries(fieldErrors)
			.filter(([, messages]) => messages.length)
			.map(([path, messages]) => ({ path, messages })),
		...($message === 'save_failed' ? [{ path: '_form', messages: [m.ui_save_failed()] }] : [])
	]);
</script>

{#snippet fieldMessages(field: 'name' | 'description')}
	{#if fieldErrors[field].length}
		<p id={field + '-error'} class="text-sm text-destructive">{fieldErrors[field].join(' ')}</p>
	{/if}
{/snippet}

<UnsavedChangesGuard dirty={guard && !!$tainted && !$submitting} />

<form
	method="POST"
	{action}
	use:enhance
	novalidate
	aria-busy={$submitting}
	class="space-y-4 rounded-xl border bg-card p-4 sm:p-6"
>
	<FormErrorSummary
		errors={feedback}
		bind:ref={summary}
		fieldTarget={(path) => (path === '_form' ? undefined : path)}
	/>
	<fieldset disabled={$submitting} class="min-w-0 space-y-4">
		<div class="space-y-1">
			<Label for="name"
				>{team ? m.team_name() : m.project_name_label()}
				<span class="text-muted-foreground">({m.ui_required()})</span></Label
			>
			<Input
				id="name"
				name="name"
				bind:value={$form.name}
				required
				maxlength={$constraints.name?.maxlength}
				aria-invalid={fieldErrors.name.length > 0 || undefined}
				aria-describedby={fieldErrors.name.length ? 'name-error' : undefined}
			/>
			{@render fieldMessages('name')}
		</div>
		<div class="space-y-1">
			<Label for="description">{m.common_description()}</Label>
			<Textarea
				id="description"
				name="description"
				bind:value={$form.description}
				maxlength={$constraints.description?.maxlength}
				rows={4}
				aria-invalid={fieldErrors.description.length > 0 || undefined}
				aria-describedby={fieldErrors.description.length ? 'description-error' : undefined}
			/>
			{@render fieldMessages('description')}
		</div>
	</fieldset>
	<div class="flex flex-wrap items-center gap-2">
		<Button type="submit" class="w-full sm:w-auto" disabled={$submitting}>
			{editing
				? $submitting
					? m.common_saving()
					: m.common_save_changes()
				: $submitting
					? m.common_creating()
					: team
						? m.team_create()
						: m.projects_create()}
		</Button>
		{#if !editing}<Button
				variant="outline"
				class="w-full sm:w-auto"
				href={team ? '/teams' : '/projects'}>{m.common_cancel()}</Button
			>{/if}
		{#if editing && $message && $message !== 'save_failed'}<p
				role="status"
				class="text-sm text-muted-foreground"
			>
				{m.common_saved()}
			</p>{/if}
	</div>
</form>
