<script lang="ts">
	import { goto } from '$app/navigation';
	import { tick } from 'svelte';
	import { toast } from 'svelte-sonner';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import TestCasePicker from '$lib/components/patterns/TestCasePicker.svelte';
	import FormErrorSummary from '$lib/components/patterns/FormErrorSummary.svelte';
	import UnsavedChangesGuard from '$lib/components/UnsavedChangesGuard.svelte';
	import { createTestPlanSchema } from '$lib/schemas/test-plan.schema';
	import { workflowFormFeedback, feedbackFor, type FormFeedback } from '$lib/form-feedback';
	import { apiFetch } from '$lib/api-client';
	import * as m from '$lib/paraglide/messages.js';

	let { data } = $props();
	let name = $state('');
	let description = $state('');
	let milestone = $state('');
	let startDate = $state('');
	let endDate = $state('');
	let selectedIds = $state<Set<number>>(new Set());
	let creating = $state(false);
	let errors = $state<FormFeedback[]>([]);
	let summary = $state<HTMLDivElement | null>(null);
	const fields: Record<string, string> = {
		name: 'planName',
		description: 'planDesc',
		milestone: 'planMilestone',
		startDate: 'planStartDate',
		endDate: 'planEndDate',
		testCaseIds: 'plan-cases'
	};
	const dirty = $derived(
		!!name || !!description || !!milestone || !!startDate || !!endDate || selectedIds.size > 0
	);

	async function handleCreate() {
		if (creating) return;
		const parsed = createTestPlanSchema.safeParse({
			name,
			description: description || undefined,
			milestone: milestone || undefined,
			startDate: startDate || undefined,
			endDate: endDate || undefined,
			testCaseIds: [...selectedIds]
		});
		errors = parsed.success ? [] : workflowFormFeedback(parsed.error.issues);
		if (!parsed.success) {
			await tick();
			summary?.focus();
			return;
		}
		creating = true;
		try {
			const result = await apiFetch<{ id: number }>(`/api/projects/${data.project.id}/test-plans`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(parsed.data),
				silent: true
			});
			toast.success(m.tp_created());
			await goto(`/projects/${data.project.id}/test-plans/${result.id}`);
		} catch {
			errors = [{ path: '_form', messages: [m.ui_save_failed()] }];
		} finally {
			creating = false;
		}
		if (errors.length) {
			await tick();
			summary?.focus();
		}
	}
</script>

<UnsavedChangesGuard dirty={dirty && !creating} />
<div class="mx-auto max-w-3xl space-y-4">
	<a
		href="/projects/{data.project.id}/test-plans"
		class="text-sm text-muted-foreground hover:text-foreground"
		>&larr; {m.common_back_to({ target: m.tp_title() })}</a
	>
	<Card.Root>
		<Card.Header><h2 class="text-2xl font-semibold tracking-tight">{m.tp_create()}</h2></Card.Header
		>
		<Card.Content>
			<form
				novalidate
				class="space-y-6"
				aria-busy={creating}
				onsubmit={(event) => {
					event.preventDefault();
					handleCreate();
				}}
			>
				<FormErrorSummary {errors} bind:ref={summary} fieldTarget={(path) => fields[path]} />
				<fieldset disabled={creating} class="min-w-0 space-y-4">
					<div class="grid gap-4 sm:grid-cols-2">
						<div class="space-y-2">
							<Label for="planName"
								>{m.tp_name()}
								<span class="text-xs text-muted-foreground">({m.ui_required()})</span></Label
							><Input
								id="planName"
								bind:value={name}
								placeholder={m.tp_name()}
								required
								aria-invalid={!!feedbackFor(errors, 'name')}
								aria-describedby={feedbackFor(errors, 'name') ? 'plan-name-error' : undefined}
							/>{#if feedbackFor(errors, 'name')}<p
									id="plan-name-error"
									class="text-sm text-destructive"
								>
									{feedbackFor(errors, 'name')}
								</p>{/if}
						</div>
						<div class="space-y-2">
							<Label for="planMilestone">{m.tp_milestone()}</Label><Input
								id="planMilestone"
								bind:value={milestone}
								aria-invalid={!!feedbackFor(errors, 'milestone')}
								aria-describedby={feedbackFor(errors, 'milestone')
									? 'plan-milestone-error'
									: undefined}
							/>{#if feedbackFor(errors, 'milestone')}<p
									id="plan-milestone-error"
									class="text-sm text-destructive"
								>
									{feedbackFor(errors, 'milestone')}
								</p>{/if}
						</div>
					</div>
					<div class="space-y-2">
						<Label for="planDesc">{m.tp_desc()}</Label><Textarea
							id="planDesc"
							bind:value={description}
							rows={3}
							aria-invalid={!!feedbackFor(errors, 'description')}
							aria-describedby={feedbackFor(errors, 'description') ? 'plan-desc-error' : undefined}
						/>{#if feedbackFor(errors, 'description')}<p
								id="plan-desc-error"
								class="text-sm text-destructive"
							>
								{feedbackFor(errors, 'description')}
							</p>{/if}
					</div>
					<div class="grid gap-4 sm:grid-cols-2">
						<div class="space-y-2">
							<Label for="planStartDate">{m.tp_start_date()}</Label><Input
								id="planStartDate"
								type="date"
								bind:value={startDate}
							/>
						</div>
						<div class="space-y-2">
							<Label for="planEndDate">{m.tp_end_date()}</Label><Input
								id="planEndDate"
								type="date"
								min={startDate || undefined}
								bind:value={endDate}
								aria-invalid={!!feedbackFor(errors, 'endDate')}
								aria-describedby={feedbackFor(errors, 'endDate') ? 'plan-end-error' : undefined}
							/>{#if feedbackFor(errors, 'endDate')}<p
									id="plan-end-error"
									class="text-sm text-destructive"
								>
									{feedbackFor(errors, 'endDate')}
								</p>{/if}
						</div>
					</div>
					<TestCasePicker
						id="plan-cases"
						cases={data.testCases}
						bind:selected={selectedIds}
						priorities={data.projectPriorities}
						tags={data.projectTags}
						error={feedbackFor(errors, 'testCaseIds')}
						disabled={creating}
					/>
				</fieldset>
				<div class="flex flex-col gap-2 border-t pt-4 sm:flex-row">
					<Button type="submit" class="w-full sm:w-auto" disabled={creating}
						>{creating ? m.common_creating() : m.tp_create()}</Button
					><Button
						variant="outline"
						class="w-full sm:w-auto"
						href="/projects/{data.project.id}/test-plans">{m.common_cancel()}</Button
					>
				</div>
			</form>
		</Card.Content>
	</Card.Root>
</div>
