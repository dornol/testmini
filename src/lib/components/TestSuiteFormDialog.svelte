<script lang="ts">
	import { tick } from 'svelte';
	import { toast } from 'svelte-sonner';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import FormErrorSummary from '$lib/components/patterns/FormErrorSummary.svelte';
	import { createTestSuiteSchema, updateTestSuiteSchema } from '$lib/schemas/test-suite.schema';
	import { workflowFormFeedback, feedbackFor, type FormFeedback } from '$lib/form-feedback';
	import { apiFetch } from '$lib/api-client';
	import * as m from '$lib/paraglide/messages.js';
	let {
		open = $bindable(false),
		projectId,
		suite = null,
		onSaved
	}: {
		open?: boolean;
		projectId: number;
		suite?: { id: number; name: string; description?: string | null } | null;
		onSaved: () => Promise<unknown>;
	} = $props();
	let name = $state('');
	let description = $state('');
	let saving = $state(false);
	let errors = $state<FormFeedback[]>([]);
	let summary = $state<HTMLDivElement | null>(null);
	const nameId = $derived(suite ? 'editSuiteName' : 'suiteName');
	const descriptionId = $derived(suite ? 'editSuiteDesc' : 'suiteDesc');
	$effect(() => {
		if (open) {
			name = suite?.name ?? '';
			description = suite?.description ?? '';
			errors = [];
		}
	});
	async function save() {
		if (saving) return;
		const parsed = (suite ? updateTestSuiteSchema : createTestSuiteSchema).safeParse({
			name,
			description: description || null
		});
		errors = parsed.success ? [] : workflowFormFeedback(parsed.error.issues);
		if (!parsed.success) {
			await tick();
			summary?.focus();
			return;
		}
		saving = true;
		try {
			await apiFetch(`/api/projects/${projectId}/test-suites${suite ? `/${suite.id}` : ''}`, {
				method: suite ? 'PATCH' : 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(parsed.data),
				silent: true
			});
		} catch {
			errors = [{ path: '_form', messages: [m.ui_save_failed()] }];
		} finally {
			saving = false;
		}
		if (errors.length) {
			await tick();
			summary?.focus();
			return;
		}
		toast.success(suite ? m.suite_updated() : m.suite_created());
		open = false;
		await onSaved();
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Portal>
		<Dialog.Overlay />
		<Dialog.Content
			class="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md"
			showCloseButton={!saving}
			onEscapeKeydown={(event) => {
				if (saving) event.preventDefault();
			}}
			interactOutsideBehavior="ignore"
		>
			<Dialog.Header
				><Dialog.Title>{suite ? m.common_edit() : m.suite_new()}</Dialog.Title></Dialog.Header
			>
			<form
				novalidate
				class="space-y-4"
				aria-busy={saving}
				onsubmit={(event) => {
					event.preventDefault();
					save();
				}}
			>
				<FormErrorSummary
					{errors}
					bind:ref={summary}
					fieldTarget={(path) =>
						path === 'name' ? nameId : path === 'description' ? descriptionId : undefined}
				/>
				<fieldset disabled={saving} class="min-w-0 space-y-4">
					<div class="space-y-2">
						<Label for={nameId}
							>{m.suite_name_label()}
							<span class="text-xs text-muted-foreground">({m.ui_required()})</span></Label
						>
						<Input
							id={nameId}
							bind:value={name}
							required
							placeholder={m.suite_name_placeholder()}
							aria-invalid={!!feedbackFor(errors, 'name')}
							aria-describedby={feedbackFor(errors, 'name') ? `${nameId}-error` : undefined}
						/>
						{#if feedbackFor(errors, 'name')}<p
								id={`${nameId}-error`}
								class="text-sm text-destructive"
							>
								{feedbackFor(errors, 'name')}
							</p>{/if}
					</div>
					<div class="space-y-2">
						<Label for={descriptionId}>{m.suite_desc_label()}</Label>
						<Textarea
							id={descriptionId}
							bind:value={description}
							rows={3}
							placeholder={m.suite_desc_placeholder()}
							aria-invalid={!!feedbackFor(errors, 'description')}
							aria-describedby={feedbackFor(errors, 'description')
								? `${descriptionId}-error`
								: undefined}
						/>
						{#if feedbackFor(errors, 'description')}<p
								id={`${descriptionId}-error`}
								class="text-sm text-destructive"
							>
								{feedbackFor(errors, 'description')}
							</p>{/if}
					</div>
				</fieldset>
				<Dialog.Footer>
					<Button
						type="button"
						variant="outline"
						class="w-full sm:w-auto"
						disabled={saving}
						onclick={() => (open = false)}>{m.common_cancel()}</Button
					>
					<Button type="submit" class="w-full sm:w-auto" disabled={saving}
						>{saving
							? m.common_saving()
							: suite
								? m.common_save_changes()
								: m.suite_create()}</Button
					>
				</Dialog.Footer>
			</form>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
