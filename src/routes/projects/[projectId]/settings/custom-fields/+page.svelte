<script lang="ts">
	import { tick } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { invalidateAll } from '$app/navigation';
	import { apiFetch } from '$lib/api-client';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Badge } from '$lib/components/ui/badge';
	import PageHeader from '$lib/components/patterns/PageHeader.svelte';
	import {
		CUSTOM_FIELD_TYPES,
		CUSTOM_FIELD_NAME_LIMIT,
		CUSTOM_FIELD_OPTION_LIMIT,
		CUSTOM_FIELD_OPTION_LENGTH_LIMIT,
		requiresCustomFieldOptions,
		type CustomFieldType
	} from '$lib/custom-fields';
	import * as m from '$lib/paraglide/messages.js';

	let { data } = $props();
	type Field = (typeof data.customFields)[number];
	type Draft = { name: string; type: string; options: string; required: boolean };
	type ErrorMessage = { field?: 'name' | 'options'; message: string };

	const isAdmin = $derived(data.userRole === 'PROJECT_ADMIN' || data.userRole === 'ADMIN');
	const baseUrl = $derived(`/api/projects/${data.project.id}/custom-fields`);
	const typeLabels: Record<CustomFieldType, () => string> = {
		TEXT: m.custom_field_type_TEXT,
		NUMBER: m.custom_field_type_NUMBER,
		SELECT: m.custom_field_type_SELECT,
		MULTISELECT: m.custom_field_type_MULTISELECT,
		DATE: m.custom_field_type_DATE,
		CHECKBOX: m.custom_field_type_CHECKBOX,
		URL: m.custom_field_type_URL
	};

	function blankDraft(): Draft {
		return { name: '', type: 'TEXT', options: '', required: false };
	}

	let draft = $state(blankDraft());
	let editing = $state<{ id: number; draft: Draft; initialOptions: string } | null>(null);
	let deleting = $state<Field | null>(null);
	let deleteOpen = $state(false);
	let pending = $state<'create' | 'update' | 'delete' | null>(null);
	let failures = $state<Partial<Record<'create' | 'update', ErrorMessage>>>({});
	let deletionFailed = $state(false);
	let deleteTrigger: HTMLElement | null = null;
	let deletionFeedback = $state<HTMLElement | null>(null);

	function typeLabel(type: string) {
		return typeLabels[type as CustomFieldType]?.() ?? type;
	}

	function focus(id: string) {
		document.getElementById(id)?.focus();
	}

	async function startEdit(field: Field) {
		delete failures.update;
		const initialOptions = Array.isArray(field.options) ? field.options.join('\n') : '';
		editing = {
			id: field.id,
			initialOptions,
			draft: {
				name: field.name,
				type: field.fieldType,
				options: initialOptions,
				required: field.required
			}
		};
		await tick();
		focus('cf-update-name');
	}

	async function stopEdit() {
		const id = editing?.id;
		editing = null;
		await tick();
		focus(`cf-edit-${id}`);
	}

	function optionsError(options: string[]): string | undefined {
		if (!options.length) return m.custom_field_options_required();
		if (
			options.length > CUSTOM_FIELD_OPTION_LIMIT ||
			options.some((option) => option.length > CUSTOM_FIELD_OPTION_LENGTH_LIMIT)
		)
			return m.custom_field_options_limits({
				count: CUSTOM_FIELD_OPTION_LIMIT,
				length: CUSTOM_FIELD_OPTION_LENGTH_LIMIT
			});
		if (new Set(options.map((option) => option.toLowerCase())).size !== options.length)
			return m.custom_field_options_duplicate();
	}

	async function save(event: SubmitEvent, value: Draft, fieldId?: number) {
		event.preventDefault();
		if (pending) return;
		const action = fieldId === undefined ? 'create' : 'update';
		delete failures[action];

		async function showFailure(failure: ErrorMessage) {
			failures[action] = failure;
			await tick();
			focus(`cf-${action}-error`);
		}

		const name = value.name.trim();
		if (!name) {
			await showFailure({ field: 'name', message: m.settings_catalog_name_required() });
			return;
		}
		const optionsChanged = fieldId === undefined || value.options !== editing?.initialOptions;
		const options =
			optionsChanged && requiresCustomFieldOptions(value.type)
				? value.options
						.split('\n')
						.map((option) => option.trim())
						.filter(Boolean)
				: undefined;
		const invalidOptions = options && optionsError(options);
		if (invalidOptions) {
			await showFailure({ field: 'options', message: invalidOptions });
			return;
		}

		pending = action;
		try {
			await apiFetch(fieldId === undefined ? baseUrl : `${baseUrl}/${fieldId}`, {
				method: fieldId === undefined ? 'POST' : 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				silent: true,
				body: JSON.stringify({
					...(fieldId === undefined && { fieldType: value.type }),
					name,
					options,
					required: value.required
				})
			});
			await invalidateAll();
			if (action === 'create') draft = blankDraft();
			pending = null;
			if (action === 'update') await stopEdit();
			else {
				await tick();
				focus('cf-create-name');
			}
			toast.success(action === 'create' ? m.custom_field_created() : m.custom_field_updated());
		} catch {
			await showFailure({ message: m.ui_save_failed() });
		} finally {
			pending = null;
		}
	}

	function startDelete(field: Field, trigger: HTMLElement) {
		deleting = field;
		deleteTrigger = trigger;
		deletionFailed = false;
		deleteOpen = true;
	}

	async function deleteField() {
		if (!deleting || pending) return;
		pending = 'delete';
		deletionFailed = false;
		try {
			await apiFetch(`${baseUrl}/${deleting.id}`, { method: 'DELETE', silent: true });
			await invalidateAll();
			pending = null;
			deleteOpen = false;
			toast.success(m.custom_field_deleted());
		} catch {
			deletionFailed = true;
			await tick();
			deletionFeedback?.focus();
		} finally {
			pending = null;
		}
	}

	function restoreDeleteFocus(event: Event) {
		event.preventDefault();
		if (deleteTrigger?.isConnected) deleteTrigger.focus();
		else focus('cf-create-name');
	}
</script>

{#snippet editor(value: Draft, fieldId?: number)}
	{@const action = fieldId === undefined ? 'create' : 'update'}
	{@const error = failures[action]}
	{@const prefix = `cf-${action}`}
	{@const edit = action === 'update'}
	<form
		onsubmit={(event) => save(event, value, fieldId)}
		class="space-y-4"
		aria-label={edit ? m.custom_field_edit() : m.custom_field_new()}
	>
		{#if error}
			<p
				id={prefix + '-error'}
				role="alert"
				tabindex="-1"
				class="rounded-md border border-destructive/40 p-3 text-sm text-destructive"
			>
				{error.message}
			</p>
		{/if}
		<fieldset disabled={pending !== null} class="min-w-0 space-y-4">
			<div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,12rem)]">
				<div class="min-w-0 space-y-1">
					<label for={prefix + '-name'} class="block text-sm font-medium"
						>{m.custom_field_name()}</label
					>
					<Input
						id={prefix + '-name'}
						bind:value={value.name}
						maxlength={CUSTOM_FIELD_NAME_LIMIT}
						required
						aria-invalid={error?.field === 'name' || undefined}
						aria-describedby={error?.field === 'name' ? prefix + '-error' : undefined}
					/>
				</div>
				<div class="min-w-0 space-y-1">
					{#if edit}
						<p class="text-sm font-medium">{m.custom_field_type()}</p>
						<p class="py-2 text-sm text-muted-foreground">{typeLabel(value.type)}</p>
					{:else}
						<label for={prefix + '-type'} class="block text-sm font-medium"
							>{m.custom_field_type()}</label
						>
						<select
							id={prefix + '-type'}
							bind:value={value.type}
							onchange={() => {
								if (error?.field === 'options') delete failures[action];
							}}
							class="h-10 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-2 focus-visible:outline-ring"
						>
							{#each CUSTOM_FIELD_TYPES as type (type)}
								<option value={type}>{typeLabel(type)}</option>
							{/each}
						</select>
					{/if}
				</div>
			</div>
			{#if requiresCustomFieldOptions(value.type)}
				<div class="space-y-1">
					<label for={prefix + '-options'} class="block text-sm font-medium"
						>{m.custom_field_options()}</label
					>
					<Textarea
						id={prefix + '-options'}
						bind:value={value.options}
						rows={4}
						aria-invalid={error?.field === 'options' || undefined}
						aria-describedby={error?.field === 'options'
							? prefix + '-error'
							: edit
								? prefix + '-options-hint'
								: undefined}
					/>
					{#if edit}<p id={prefix + '-options-hint'} class="text-sm text-muted-foreground">
							{m.custom_field_edit_options_hint()}
						</p>{/if}
				</div>
			{/if}
			<label class="flex min-h-9 w-fit items-center gap-2 text-sm font-medium">
				<input type="checkbox" bind:checked={value.required} class="size-4 accent-primary" />
				{m.custom_field_required()}
			</label>
		</fieldset>
		<div class="flex flex-wrap gap-2">
			<Button type="submit" class="w-full sm:w-auto" disabled={pending !== null}>
				{pending === action
					? m.common_saving()
					: edit
						? m.common_save_changes()
						: m.custom_field_new()}
			</Button>
			{#if edit}<Button
					type="button"
					variant="outline"
					class="w-full sm:w-auto"
					disabled={pending !== null}
					onclick={stopEdit}>{m.common_cancel()}</Button
				>{/if}
		</div>
	</form>
{/snippet}

<div class="space-y-4">
	<PageHeader
		title={m.custom_field_title()}
		description={isAdmin ? m.custom_field_desc() : m.custom_field_readonly()}
	/>

	{#if isAdmin}
		<div class="rounded-xl border bg-card p-4 sm:p-6">{@render editor(draft)}</div>
	{/if}

	{#if data.customFields.length === 0}
		<p class="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
			{isAdmin ? m.custom_field_empty() : m.common_no_results()}
		</p>
	{:else}
		<ul aria-label={m.custom_field_title()} class="divide-y rounded-xl border bg-card">
			{#each data.customFields as field (field.id)}
				<li class="min-w-0 p-4">
					{#if editing?.id === field.id && isAdmin}
						{@render editor(editing.draft, field.id)}
					{:else}
						<div class="flex flex-wrap items-start justify-between gap-3">
							<div class="min-w-0 basis-full space-y-2 sm:flex-1">
								<div class="flex flex-wrap items-center gap-2">
									<span class="min-w-0 font-medium [overflow-wrap:anywhere]">{field.name}</span>
									<Badge variant="outline">{typeLabel(field.fieldType)}</Badge>
									{#if field.required}<Badge variant="secondary">{m.custom_field_required()}</Badge
										>{/if}
								</div>
								{#if Array.isArray(field.options) && field.options.length}
									<p class="text-sm text-muted-foreground [overflow-wrap:anywhere]">
										{field.options.join(', ')}
									</p>
								{/if}
							</div>
							{#if isAdmin}
								<div class="flex w-full flex-wrap gap-2 sm:w-auto">
									<Button
										id={`cf-edit-${field.id}`}
										variant="outline"
										size="sm"
										disabled={pending !== null}
										aria-label={m.settings_catalog_item_action({
											action: m.common_edit(),
											name: field.name
										})}
										onclick={() => startEdit(field)}>{m.common_edit()}</Button
									>
									<Button
										variant="outline"
										size="sm"
										disabled={pending !== null}
										aria-label={m.settings_catalog_item_action({
											action: m.common_delete(),
											name: field.name
										})}
										onclick={(event) => startDelete(field, event.currentTarget)}
										>{m.common_delete()}</Button
									>
								</div>
							{/if}
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>

<AlertDialog.Root bind:open={deleteOpen}>
	{#if deleting}
		<AlertDialog.Content
			onCloseAutoFocus={restoreDeleteFocus}
			escapeKeydownBehavior={pending ? 'ignore' : 'close'}
		>
			<AlertDialog.Header>
				<AlertDialog.Title>{m.custom_field_delete_title()}</AlertDialog.Title>
				<AlertDialog.Description class="[overflow-wrap:anywhere]"
					>{m.custom_field_delete_confirm({ name: deleting.name })}</AlertDialog.Description
				>
			</AlertDialog.Header>
			{#if deletionFailed}<p
					role="alert"
					tabindex="-1"
					bind:this={deletionFeedback}
					class="text-sm text-destructive"
				>
					{m.error_remove_failed()}
				</p>{/if}
			<AlertDialog.Footer>
				<AlertDialog.Cancel disabled={pending !== null}>{m.common_cancel()}</AlertDialog.Cancel>
				<Button
					type="button"
					variant="destructive"
					disabled={pending !== null}
					onclick={deleteField}
				>
					{pending === 'delete' ? m.common_saving() : m.common_delete()}
				</Button>
			</AlertDialog.Footer>
		</AlertDialog.Content>
	{/if}
</AlertDialog.Root>
