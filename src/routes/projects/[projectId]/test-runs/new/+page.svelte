<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { tick } from 'svelte';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Select from '$lib/components/ui/select';
	import TestCasePicker from '$lib/components/patterns/TestCasePicker.svelte';
	import FormErrorSummary from '$lib/components/patterns/FormErrorSummary.svelte';
	import UnsavedChangesGuard from '$lib/components/UnsavedChangesGuard.svelte';
	import { createTestRunSchema } from '$lib/schemas/test-run.schema';
	import { createCrossEnvRunSchema } from '$lib/schemas/cross-env-run.schema';
	import { workflowFormFeedback, feedbackFor, type FormFeedback } from '$lib/form-feedback';
	import { apiFetch } from '$lib/api-client';
	import { toast } from 'svelte-sonner';
	import * as m from '$lib/paraglide/messages.js';

	let { data } = $props();
	let selectedIds = $state<Set<number>>(new Set());
	let runName = $state('');
	let crossEnvMode = $state(false);
	let selectedEnvironments = $state<Set<string>>(new Set());
	let selectedEnv = $state('DEV');
	let submitting = $state(false);
	let loadingSuite = $state(false);
	let selectedSuite = $state('');
	let suiteNotice = $state('');
	let errors = $state<FormFeedback[]>([]);
	let summary = $state<HTMLDivElement | null>(null);
	let initializedProjectId = $state<number | null>(null);
	const canCreateCrossEnv = $derived(['PROJECT_ADMIN', 'ADMIN', 'QA'].includes(data.userRole));
	const environments = $derived(data.projectEnvironments);
	const initialEnvironment = $derived(
		data.projectEnvironments.find((item) => item.isDefault)?.name ??
			data.projectEnvironments[0]?.name ??
			'DEV'
	);
	const dirty = $derived(
		!!runName ||
			crossEnvMode ||
			selectedEnv !== initialEnvironment ||
			selectedIds.size !== (data.preselectedIds?.length ?? 0) ||
			(data.preselectedIds ?? []).some((id) => !selectedIds.has(id))
	);

	const fields: Record<string, string> = {
		name: 'name',
		environment: 'environment',
		environments: 'environment',
		testCaseIds: 'run-cases',
		suite: 'load-suite'
	};

	// Do not discard a draft when a failed action updates page data.
	$effect(() => {
		if (initializedProjectId === data.project.id) return;
		selectedIds = new Set(data.preselectedIds ?? []);
		selectedEnv =
			data.projectEnvironments.find((item) => item.isDefault)?.name ??
			data.projectEnvironments[0]?.name ??
			'DEV';
		selectedEnvironments = new Set([selectedEnv]);
		initializedProjectId = data.project.id;
	});

	async function focusErrors() {
		await tick();
		summary?.focus();
	}
	function toggleEnvironment(name: string) {
		const next = new Set(selectedEnvironments);
		if (next.has(name)) next.delete(name);
		else next.add(name);
		selectedEnvironments = next;
	}
	function switchMode(value: boolean) {
		crossEnvMode = value;
		errors = [];
	}

	async function loadFromSuite(suiteId: string) {
		if (!suiteId || loadingSuite) return;
		loadingSuite = true;
		suiteNotice = '';
		errors = errors.filter((error) => error.path !== 'suite');
		try {
			const suite = await apiFetch<{ items: { testCaseId: number }[] }>(
				`/api/projects/${data.project.id}/test-suites/${suiteId}`,
				{ silent: true }
			);
			const next = new Set(selectedIds);
			const previous = next.size;
			for (const item of suite.items) next.add(item.testCaseId);
			selectedIds = next;
			suiteNotice = m.ui_suite_loaded({ count: next.size - previous });
		} catch {
			errors = [...errors, { path: 'suite', messages: [m.ui_load_failed()] }];
		} finally {
			loadingSuite = false;
		}
		if (feedbackFor(errors, 'suite')) await focusErrors();
	}

	const prepareSubmit: SubmitFunction = async ({ cancel }) => {
		if (submitting || loadingSuite) {
			cancel();
			return;
		}
		const parsed = crossEnvMode
			? createCrossEnvRunSchema.safeParse({
					name: runName,
					testCaseIds: [...selectedIds],
					environments: [...selectedEnvironments]
				})
			: createTestRunSchema.safeParse({
					name: runName,
					environment: selectedEnv,
					testCaseIds: [...selectedIds]
				});
		errors = parsed.success ? [] : workflowFormFeedback(parsed.error.issues);
		if (!parsed.success) {
			cancel();
			await focusErrors();
			return;
		}
		submitting = true;
		if (crossEnvMode) {
			cancel();
			try {
				const result = await apiFetch<{ runs: { id: number }[] }>(
					`/api/projects/${data.project.id}/test-runs/cross-env`,
					{
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify(parsed.data),
						silent: true
					}
				);
				toast.success(`${m.cross_env_create()} (${result.runs.length})`);
				await goto(`/projects/${data.project.id}/test-runs`);
			} catch {
				errors = [{ path: '_form', messages: [m.ui_save_failed()] }];
			} finally {
				submitting = false;
			}
			if (errors.length) await focusErrors();
			return;
		}
		return async ({ result, update }) => {
			try {
				if (result.type === 'failure' || result.type === 'error') {
					errors = [{ path: '_form', messages: [m.ui_save_failed()] }];
				} else {
					await update({ reset: false });
				}
			} finally {
				submitting = false;
			}
			if (errors.length) await focusErrors();
		};
	};
</script>

<UnsavedChangesGuard dirty={initializedProjectId !== null && dirty && !submitting} />
<div class="mx-auto max-w-3xl space-y-4">
	<a
		href="/projects/{data.project.id}/test-runs"
		class="text-sm text-muted-foreground hover:text-foreground"
		>&larr; {m.common_back_to({ target: m.tr_title() })}</a
	>
	<Card.Root>
		<Card.Header
			><h2 class="text-2xl font-semibold tracking-tight">{m.tr_new_title()}</h2>
			<Card.Description>{m.tr_new_desc()}</Card.Description></Card.Header
		>
		<Card.Content>
			<form
				method="POST"
				use:enhance={prepareSubmit}
				novalidate
				class="space-y-6"
				aria-busy={submitting}
			>
				<FormErrorSummary {errors} bind:ref={summary} fieldTarget={(path) => fields[path]} />
				<fieldset disabled={submitting} class="min-w-0 space-y-4">
					<div role="group" aria-label={m.common_environment()} class="flex flex-wrap gap-2">
						<Button
							type="button"
							variant={!crossEnvMode ? 'default' : 'outline'}
							aria-pressed={!crossEnvMode}
							onclick={() => switchMode(false)}>{m.common_environment()}</Button
						>
						{#if canCreateCrossEnv}<Button
								type="button"
								variant={crossEnvMode ? 'default' : 'outline'}
								aria-pressed={crossEnvMode}
								onclick={() => switchMode(true)}>{m.cross_env_title()}</Button
							>{/if}
					</div>
					<div class="grid gap-4 sm:grid-cols-2">
						<div class="space-y-2">
							<Label for="name"
								>{m.tr_run_name()}
								<span class="text-xs text-muted-foreground">({m.ui_required()})</span></Label
							><Input
								id="name"
								name="name"
								bind:value={runName}
								placeholder={m.tr_run_name_placeholder()}
								required
								aria-invalid={!!feedbackFor(errors, 'name')}
								aria-describedby={feedbackFor(errors, 'name') ? 'run-name-error' : undefined}
							/>{#if feedbackFor(errors, 'name')}<p
									id="run-name-error"
									class="text-sm text-destructive"
								>
									{feedbackFor(errors, 'name')}
								</p>{/if}
						</div>
						<div class="space-y-2">
							<Label for={!crossEnvMode ? 'environment' : undefined}
								>{crossEnvMode ? m.cross_env_select_envs() : m.common_environment()}</Label
							>
							{#if crossEnvMode}
								<fieldset
									id="environment"
									tabindex="-1"
									aria-describedby={feedbackFor(errors, 'environments')
										? 'run-env-error'
										: undefined}
									class="grid grid-cols-2 gap-2 rounded-md border bg-background p-3"
								>
									<legend class="sr-only">{m.cross_env_select_envs()}</legend>
									{#each environments as env (env.id)}<label
											class="flex min-h-11 min-w-0 cursor-pointer items-center gap-2 text-sm"
											><input
												type="checkbox"
												class="size-4 shrink-0 rounded border-muted-foreground"
												checked={selectedEnvironments.has(env.name)}
												onchange={() => toggleEnvironment(env.name)}
											/><span class="[overflow-wrap:anywhere]">{env.name}</span></label
										>{/each}
								</fieldset>
							{:else}
								<input type="hidden" name="environment" value={selectedEnv} />
								<Select.Root type="single" bind:value={selectedEnv} disabled={submitting}
									><Select.Trigger
										id="environment"
										class="w-full"
										aria-invalid={!!feedbackFor(errors, 'environment')}
										aria-describedby={feedbackFor(errors, 'environment')
											? 'run-env-error'
											: undefined}>{selectedEnv}</Select.Trigger
									><Select.Content
										>{#each environments as env (env.id)}<Select.Item
												value={env.name}
												label={env.name}
											/>{/each}</Select.Content
									></Select.Root
								>
							{/if}
							{#if feedbackFor(errors, crossEnvMode ? 'environments' : 'environment')}<p
									id="run-env-error"
									class="text-sm text-destructive"
								>
									{feedbackFor(errors, crossEnvMode ? 'environments' : 'environment')}
								</p>{/if}
						</div>
					</div>
					{#if data.suites.length > 0}
						<div class="space-y-2" aria-busy={loadingSuite}>
							<div class="flex flex-col gap-2 sm:flex-row sm:items-end">
								<div class="min-w-0 flex-1 space-y-1">
									<Label for="load-suite">{m.tr_load_suite()}</Label><Select.Root
										type="single"
										bind:value={selectedSuite}
										onValueChange={(value) => loadFromSuite(value)}
										disabled={submitting || loadingSuite}
										><Select.Trigger id="load-suite" class="w-full"
											><span class="truncate"
												>{data.suites.find((item) => String(item.id) === selectedSuite)?.name ||
													m.tr_load_suite()}</span
											></Select.Trigger
										><Select.Content
											>{#each data.suites as suite (suite.id)}<Select.Item
													value={String(suite.id)}
													label={`${suite.name} (${suite.itemCount})`}
												/>{/each}</Select.Content
										></Select.Root
									>
								</div>
								<Button
									type="button"
									variant="outline"
									disabled={!selectedSuite || loadingSuite || submitting}
									onclick={() => loadFromSuite(selectedSuite)}
									>{loadingSuite ? m.common_loading() : m.tr_load_suite()}</Button
								>
							</div>
							{#if suiteNotice}<p role="status" class="text-sm text-muted-foreground">
									{suiteNotice}
								</p>{/if}
						</div>
					{/if}
					<TestCasePicker
						id="run-cases"
						cases={data.testCases}
						bind:selected={selectedIds}
						priorities={data.projectPriorities}
						tags={data.projectTags}
						error={feedbackFor(errors, 'testCaseIds')}
						disabled={submitting || loadingSuite}
					/>
				</fieldset>
				{#each [...selectedIds] as id (id)}<input
						type="hidden"
						name="testCaseIds"
						value={id}
					/>{/each}
				<div class="flex flex-col gap-2 border-t pt-4 sm:flex-row">
					<Button type="submit" class="w-full sm:w-auto" disabled={submitting || loadingSuite}
						>{submitting
							? m.common_creating()
							: crossEnvMode
								? m.cross_env_create()
								: m.tr_create_run({ count: selectedIds.size })}</Button
					><Button
						variant="outline"
						class="w-full sm:w-auto"
						href="/projects/{data.project.id}/test-runs">{m.common_cancel()}</Button
					>
				</div>
			</form>
		</Card.Content>
	</Card.Root>
</div>
