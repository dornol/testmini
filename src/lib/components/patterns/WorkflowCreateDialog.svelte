<script lang="ts">
	import { tick, type Snippet } from 'svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { apiFetch } from '$lib/api-client';
	import type { FormFeedback } from '$lib/form-feedback';
	import FormErrorSummary from './FormErrorSummary.svelte';
	import * as m from '$lib/paraglide/messages.js';

	let {
		open = $bindable(false),
		title,
		description,
		submitLabel,
		endpoint,
		fieldTarget,
		validate,
		onCreated,
		children
	}: {
		open: boolean;
		title: string;
		description?: string;
		submitLabel: string;
		endpoint: string;
		fieldTarget: (path: string) => string | undefined;
		validate: () => { data: unknown } | { errors: FormFeedback[] };
		onCreated: (id: number) => void;
		children: Snippet<[FormFeedback[]]>;
	} = $props();

	let saving = $state(false);
	let errors = $state<FormFeedback[]>([]);
	let summary = $state<HTMLDivElement | null>(null);

	$effect(() => {
		if (!open) errors = [];
	});

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (saving) return;
		const result = validate();
		if ('errors' in result) {
			errors = result.errors;
			await tick();
			summary?.focus();
			return;
		}

		errors = [];
		saving = true;
		let created: { id: number };
		try {
			created = await apiFetch(endpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(result.data),
				silent: true
			});
		} catch {
			errors = [{ path: '_form', messages: [m.ui_save_failed()] }];
			saving = false;
			await tick();
			summary?.focus();
			return;
		}
		saving = false;
		open = false;
		onCreated(created.id);
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content
		class="sm:max-w-md"
		showCloseButton={!saving}
		interactOutsideBehavior="ignore"
		escapeKeydownBehavior={saving ? 'ignore' : 'close'}
	>
		<Dialog.Header>
			<Dialog.Title>{title}</Dialog.Title>
			{#if description}<Dialog.Description>{description}</Dialog.Description>{/if}
		</Dialog.Header>
		<form novalidate class="space-y-4" aria-busy={saving} onsubmit={submit}>
			<FormErrorSummary {errors} bind:ref={summary} {fieldTarget} />
			<fieldset disabled={saving} class="min-w-0 space-y-4">
				{@render children(errors)}
			</fieldset>
			<Dialog.Footer>
				<Button type="button" variant="outline" disabled={saving} onclick={() => (open = false)}>
					{m.common_cancel()}
				</Button>
				<Button type="submit" disabled={saving}>
					{saving ? m.common_creating() : submitLabel}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
