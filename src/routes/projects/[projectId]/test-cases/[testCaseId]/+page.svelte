<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { enhance as formEnhance } from '$app/forms';
	import { superForm } from 'sveltekit-superforms';
	import { zodClient } from 'sveltekit-superforms/adapters';
	import { updateTestCaseSchema } from '$lib/schemas/test-case.schema';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { toast } from 'svelte-sonner';
	import StepsEditor from '$lib/components/StepsEditor.svelte';
	import AttachmentManager from '$lib/components/AttachmentManager.svelte';
	import * as m from '$lib/paraglide/messages.js';

	let { data } = $props();

	let editing = $state(false);
	let deleteDialogOpen = $state(false);
	let showVersions = $state(false);

	// @ts-ignore zod 3.24 type mismatch with superforms adapter
	const validators = zodClient(updateTestCaseSchema);
	const { form, errors, enhance, submitting, reset } = superForm(data.form, {
		validators,
		dataType: 'json',
		onUpdated({ form }) {
			if (form.message) {
				if (form.valid) {
					toast.success(form.message);
					editing = false;
				} else {
					toast.error(form.message);
				}
			}
		}
	});

	const tc = $derived(data.testCaseDetail);
	const version = $derived(tc.latestVersion);
	const canEdit = $derived(data.userRole !== 'VIEWER');
	const canDelete = $derived(data.userRole === 'PROJECT_ADMIN' || data.userRole === 'ADMIN');
	const basePath = $derived(`/projects/${data.project.id}/test-cases`);

	function startEdit() {
		reset();
		editing = true;
	}

	function cancelEdit() {
		reset();
		editing = false;
	}

	function priorityVariant(
		p: string
	): 'default' | 'secondary' | 'outline' | 'destructive' {
		switch (p) {
			case 'CRITICAL':
				return 'destructive';
			case 'HIGH':
				return 'default';
			case 'MEDIUM':
				return 'secondary';
			default:
				return 'outline';
		}
	}
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<a href={basePath} class="text-muted-foreground hover:text-foreground text-sm"
				>&larr; {m.common_back_to({ target: m.tc_title() })}</a
			>
			<div class="mt-1 flex items-center gap-3">
				<h2 class="text-xl font-bold">{tc.key}</h2>
				{#if version}
					<Badge variant={priorityVariant(version.priority)}>{version.priority}</Badge>
				{/if}
			</div>
		</div>
		<div class="flex gap-2">
			<Button variant="outline" size="sm" onclick={() => (showVersions = !showVersions)}>
				{showVersions ? m.tc_detail_hide_history() : m.tc_detail_version_history()}
			</Button>
			{#if canEdit && !editing}
				<Button size="sm" onclick={startEdit}>{m.common_edit()}</Button>
			{/if}
			{#if canDelete && !editing}
				<AlertDialog.Root bind:open={deleteDialogOpen}>
					<AlertDialog.Trigger>
						{#snippet child({ props })}
							<Button variant="destructive" size="sm" {...props}>{m.common_delete()}</Button>
						{/snippet}
					</AlertDialog.Trigger>
					<AlertDialog.Portal>
						<AlertDialog.Overlay />
						<AlertDialog.Content>
							<AlertDialog.Header>
								<AlertDialog.Title>{m.tc_detail_delete_title()}</AlertDialog.Title>
								<AlertDialog.Description>
									{m.tc_detail_delete_confirm({ key: tc.key })}
								</AlertDialog.Description>
							</AlertDialog.Header>
							<AlertDialog.Footer>
								<AlertDialog.Cancel>{m.common_cancel()}</AlertDialog.Cancel>
								<form
									method="POST"
									action="?/delete"
									use:formEnhance={() => {
										return async ({ result }) => {
											if (result.type === 'success') {
												toast.success(m.tc_deleted());
												goto(basePath);
											} else {
												toast.error('Failed to delete test case');
											}
										};
									}}
								>
									<Button type="submit" variant="destructive">{m.common_delete()}</Button>
								</form>
							</AlertDialog.Footer>
						</AlertDialog.Content>
					</AlertDialog.Portal>
				</AlertDialog.Root>
			{/if}
		</div>
	</div>

	<div class="grid gap-6 {showVersions ? 'lg:grid-cols-[1fr_300px]' : ''}">
		<!-- Main Content -->
		<div>
			{#if editing}
				<!-- Edit Mode -->
				<Card.Root>
					<Card.Header>
						<Card.Title>{m.tc_detail_edit()}</Card.Title>
					</Card.Header>
					<Card.Content>
						<form method="POST" action="?/update" use:enhance class="space-y-6">
							<div class="space-y-2">
								<Label for="title">{m.tc_title_label()}</Label>
								<Input id="title" name="title" bind:value={$form.title} />
								{#if $errors.title}
									<p class="text-destructive text-sm">{$errors.title}</p>
								{/if}
							</div>

							<div class="space-y-2">
								<Label for="priority">{m.common_priority()}</Label>
								<select
									id="priority"
									name="priority"
									bind:value={$form.priority}
									class="border-input bg-background ring-offset-background focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
								>
									<option value="LOW">{m.priority_low()}</option>
									<option value="MEDIUM">{m.priority_medium()}</option>
									<option value="HIGH">{m.priority_high()}</option>
									<option value="CRITICAL">{m.priority_critical()}</option>
								</select>
							</div>

							<div class="space-y-2">
								<Label for="precondition">{m.tc_precondition()}</Label>
								<Textarea
									id="precondition"
									name="precondition"
									value={$form.precondition as string}
									oninput={(e) => {
										$form.precondition = e.currentTarget.value;
									}}
									rows={3}
								/>
							</div>

							<StepsEditor
								value={($form.steps ?? []) as { action: string; expected: string }[]}
								onchange={(s) => {
									// @ts-ignore zod 3.24 type mismatch
									$form.steps = s;
								}}
							/>

							<div class="space-y-2">
								<Label for="expectedResult">{m.tc_expected_result()}</Label>
								<Textarea
									id="expectedResult"
									name="expectedResult"
									value={$form.expectedResult as string}
									oninput={(e) => {
										$form.expectedResult = e.currentTarget.value;
									}}
									rows={3}
								/>
							</div>

							<div class="flex gap-3">
								<Button type="submit" disabled={$submitting}>
									{$submitting ? m.common_saving() : m.common_save_changes()}
								</Button>
								<Button type="button" variant="outline" onclick={cancelEdit}>{m.common_cancel()}</Button>
							</div>
						</form>
					</Card.Content>
				</Card.Root>
			{:else}
				<!-- View Mode -->
				<Card.Root>
					<Card.Header>
						<Card.Title>{version?.title ?? m.tc_detail_untitled()}</Card.Title>
						<Card.Description>
							{m.tc_detail_version({ version: version?.versionNo ?? 0 })} &middot; Created {new Date(
								tc.createdAt
							).toLocaleDateString()}
						</Card.Description>
					</Card.Header>
					<Card.Content class="space-y-6">
						{#if version?.precondition}
							<div>
								<h4 class="text-sm font-medium">{m.tc_precondition()}</h4>
								<p class="text-muted-foreground mt-1 whitespace-pre-wrap text-sm">
									{version.precondition}
								</p>
							</div>
						{/if}

						{#if version?.steps && version.steps.length > 0}
							<div>
								<h4 class="text-sm font-medium">{m.tc_detail_steps()}</h4>
								<div class="mt-2 space-y-2">
									{#each version.steps as step, i (step.order)}
										<div class="rounded-md border p-3">
											<div class="text-muted-foreground mb-1 text-xs font-medium">
												{m.tc_detail_step_n({ n: step.order })}
											</div>
											<div class="grid gap-2 sm:grid-cols-2">
												<div>
													<span class="text-muted-foreground text-xs">{m.tc_detail_action()}:</span>
													<p class="text-sm">{step.action}</p>
												</div>
												{#if step.expected}
													<div>
														<span class="text-muted-foreground text-xs">{m.tc_detail_expected()}:</span>
														<p class="text-sm">{step.expected}</p>
													</div>
												{/if}
											</div>
										</div>
									{/each}
								</div>
							</div>
						{/if}

						{#if version?.expectedResult}
							<div>
								<h4 class="text-sm font-medium">{m.tc_expected_result()}</h4>
								<p class="text-muted-foreground mt-1 whitespace-pre-wrap text-sm">
									{version.expectedResult}
								</p>
							</div>
						{/if}
					</Card.Content>
				</Card.Root>
			{/if}

			<!-- Attachments -->
			<Card.Root>
				<Card.Content class="pt-6">
					<AttachmentManager
						referenceType="TESTCASE"
						referenceId={tc.id}
						editable={canEdit}
					/>
				</Card.Content>
			</Card.Root>
		</div>

		<!-- Version History Sidebar -->
		{#if showVersions}
			<Card.Root class="h-fit">
				<Card.Header>
					<Card.Title class="text-base">{m.tc_detail_version_history()}</Card.Title>
				</Card.Header>
				<Card.Content>
					{#if data.versions.length === 0}
						<p class="text-muted-foreground text-sm">{m.tc_detail_no_versions()}</p>
					{:else}
						<div class="space-y-3">
							{#each data.versions as v (v.id)}
								<div
									class="rounded-md border p-3 {v.id === tc.latestVersion?.id
										? 'border-primary bg-primary/5'
										: ''}"
								>
									<div class="flex items-center justify-between">
										<span class="text-sm font-medium">v{v.versionNo}</span>
										<Badge variant={priorityVariant(v.priority)} class="text-xs">
											{v.priority}
										</Badge>
									</div>
									<p class="mt-1 text-sm">{v.title}</p>
									<div class="text-muted-foreground mt-1 text-xs">
										{v.updatedBy} &middot; {new Date(v.createdAt).toLocaleDateString()}
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</Card.Content>
			</Card.Root>
		{/if}
	</div>
</div>
