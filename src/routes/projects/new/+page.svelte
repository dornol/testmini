<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { superForm } from 'sveltekit-superforms';
	import { createProjectSchema } from '$lib/schemas/project.schema';
	import { zodValidators } from '$lib/form-utils';
	import * as m from '$lib/paraglide/messages.js';
	import PageHeader from '$lib/components/patterns/PageHeader.svelte';
	import FormErrorSummary from '$lib/components/patterns/FormErrorSummary.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';

	let { data, form: actionData } = $props();
	let summary = $state<HTMLDivElement | null>(null);
	let submitted = $state(false);

	async function focusSummary() {
		await tick();
		summary?.focus();
	}

	const { form, errors, constraints, message, enhance, submitting } = superForm(
		untrack(() => actionData?.form ?? data.form),
		{
			validators: zodValidators(createProjectSchema),
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

<div class="mx-auto max-w-lg space-y-4">
	<a
		href="/projects"
		class="inline-flex min-h-8 items-center rounded-sm text-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
	>
		&larr; {m.common_back_to({ target: m.nav_projects() })}
	</a>
	<PageHeader title={m.project_new_title()} description={m.project_new_desc()} level={1} />

	<form
		method="POST"
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
					>{m.project_name_label()}
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
		<div class="flex flex-col gap-2 sm:flex-row">
			<Button type="submit" disabled={$submitting}
				>{$submitting ? m.common_creating() : m.projects_create()}</Button
			>
			<Button variant="outline" href="/projects">{m.common_cancel()}</Button>
		</div>
	</form>
</div>
