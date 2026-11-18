<script lang="ts">
	import { tick } from 'svelte';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { toast } from 'svelte-sonner';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import PageHeader from '$lib/components/patterns/PageHeader.svelte';
	import { TAG_PALETTE } from '$lib/constants';
	import * as m from '$lib/paraglide/messages.js';

	type Kind = 'tag' | 'priority' | 'environment';
	type Item = {
		id: number;
		name: string;
		color: string;
		isDefault?: boolean;
		baseUrl?: string | null;
		credentials?: string | null;
		memo?: string | null;
	};
	type Action = 'create' | 'update' | 'delete';
	type Failure = { message: string; field?: string };

	let { kind, items, canEdit }: { kind: Kind; items: Item[]; canEdit: boolean } = $props();

	const settings = {
		tag: {
			title: m.tag_title,
			desc: m.tag_desc,
			add: m.tag_new,
			name: m.tag_name,
			empty: m.tag_empty,
			duplicate: m.tag_duplicate,
			deleteTitle: m.tag_delete_title,
			deleteConfirm: m.tag_delete_confirm,
			created: m.tag_created,
			updated: m.tag_updated,
			deleted: m.tag_deleted,
			limit: 50,
			id: 'tagId',
			color: '#ef4444'
		},
		priority: {
			title: m.priority_title,
			desc: m.priority_desc,
			add: m.priority_new,
			name: m.priority_name,
			empty: m.priority_empty,
			duplicate: m.priority_duplicate,
			deleteTitle: m.priority_delete_title,
			deleteConfirm: m.priority_delete_confirm,
			created: m.priority_created,
			updated: m.priority_updated,
			deleted: m.priority_deleted,
			limit: 30,
			id: 'priorityId',
			color: '#6b7280'
		},
		environment: {
			title: m.env_title,
			desc: m.env_desc,
			add: m.env_new,
			name: m.env_name,
			empty: m.env_empty,
			duplicate: m.env_duplicate,
			deleteTitle: m.env_delete_title,
			deleteConfirm: m.env_delete_confirm,
			created: m.env_created,
			updated: m.env_updated,
			deleted: m.env_deleted,
			limit: 30,
			id: 'environmentId',
			color: '#3b82f6'
		}
	};
	const labels = $derived(settings[kind]);

	let editing = $state<Item | null>(null);
	let deleting = $state<Item | null>(null);
	let deleteOpen = $state(false);
	let pending = $state<Action | null>(null);
	let failures = $state<Partial<Record<Action, Failure>>>({});
	let deleteTrigger: HTMLElement | null = null;
	let createName = $state<HTMLInputElement | null>(null);
	let editName = $state<HTMLInputElement | null>(null);
	let deleteError = $state<HTMLElement | null>(null);

	async function startEdit(item: Item) {
		delete failures.update;
		editing = item;
		await tick();
		editName?.focus();
	}

	async function stopEdit() {
		const item = editing;
		editing = null;
		await tick();
		if (item) document.getElementById(`edit-setting-${item.id}`)?.focus();
	}

	function startDelete(item: Item, trigger: HTMLElement) {
		delete failures.delete;
		deleting = item;
		deleteTrigger = trigger;
		deleteOpen = true;
	}

	function deleteClosed(event: Event) {
		event.preventDefault();
		(deleteTrigger?.isConnected ? deleteTrigger : createName)?.focus();
	}

	function submission(action: Action): SubmitFunction {
		return ({ formElement, formData, cancel }) => {
			if (pending) {
				cancel();
				return;
			}
			delete failures[action];
			const showFailure = async (failure: Failure) => {
				failures[action] = failure;
				await tick();
				if (action === 'delete') deleteError?.focus();
				else formElement.querySelector<HTMLElement>('[data-form-feedback]')?.focus();
			};
			if (action !== 'delete' && !String(formData.get('name') ?? '').trim()) {
				cancel();
				void showFailure({ field: 'name', message: m.settings_catalog_name_required() });
				return;
			}

			pending = action;
			return async ({ result }) => {
				try {
					if (result.type === 'success') {
						await invalidateAll();
						pending = null;
						if (action === 'create') {
							formElement.reset();
							await tick();
							createName?.focus();
							toast.success(labels.created());
						} else if (action === 'update') {
							await stopEdit();
							toast.success(labels.updated());
						} else {
							deleteOpen = false;
							toast.success(labels.deleted());
						}
					} else if (action === 'delete') {
						await showFailure({ message: m.error_remove_failed() });
					} else if (result.type === 'failure' && result.data?.duplicate) {
						await showFailure({ field: 'name', message: labels.duplicate() });
					} else {
						const errors = result.type === 'failure' && result.data?.errors;
						const field = errors && Object.keys(errors)[0];
						await showFailure(
							field
								? { field, message: m.settings_catalog_field_invalid() }
								: { message: m.ui_save_failed() }
						);
					}
				} finally {
					pending = null;
				}
			};
		};
	}
</script>

{#snippet fields(action: 'create' | 'update', item?: Item)}
	{@const initialColor = item?.color.toLowerCase() ?? labels.color}
	{@const colors = TAG_PALETTE.includes(initialColor)
		? TAG_PALETTE
		: [initialColor, ...TAG_PALETTE]}
	{@const failure = failures[action]}
	{@const feedbackId = action + '-setting-feedback'}
	<form method="POST" action={'?/' + action} use:enhance={submission(action)} class="space-y-4">
		{#if item}<input type="hidden" name={labels.id} value={item.id} />{/if}
		{#if failure}
			<p
				id={feedbackId}
				role="alert"
				tabindex="-1"
				data-form-feedback
				class="rounded-md border border-destructive/40 p-3 text-sm text-destructive"
			>
				{failure.message}
			</p>
		{/if}
		<fieldset disabled={pending !== null} class="min-w-0 space-y-4">
			<div class="space-y-1">
				<label for={action + '-setting-name'} class="block text-sm font-medium"
					>{labels.name()}</label
				>
				{#if action === 'create'}
					<Input
						id="create-setting-name"
						bind:ref={createName}
						name="name"
						required
						maxlength={labels.limit}
						aria-invalid={failure?.field === 'name' || undefined}
						aria-describedby={failure?.field === 'name' ? feedbackId : undefined}
					/>
				{:else}
					<Input
						id="update-setting-name"
						bind:ref={editName}
						name="name"
						value={item?.name}
						required
						maxlength={labels.limit}
						aria-invalid={failure?.field === 'name' || undefined}
						aria-describedby={failure?.field === 'name' ? feedbackId : undefined}
					/>
				{/if}
			</div>
			<fieldset
				class="min-w-0"
				aria-describedby={failure?.field === 'color' ? feedbackId : undefined}
			>
				<legend class="mb-1 text-sm font-medium">{m.tag_color()}</legend>
				<div class="flex flex-wrap gap-1">
					{#each colors as color (color)}
						<label
							class="inline-flex size-10 cursor-pointer items-center justify-center rounded-md"
						>
							<input
								class="peer sr-only"
								type="radio"
								name="color"
								value={color}
								checked={color === initialColor}
								defaultChecked={color === initialColor}
								aria-label={color}
							/>
							<span
								aria-hidden="true"
								class="size-6 rounded-full border border-foreground/30 peer-checked:ring-2 peer-checked:ring-foreground peer-checked:ring-offset-2 peer-checked:ring-offset-background peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-ring"
								style:background-color={color}
							></span>
						</label>
					{/each}
				</div>
			</fieldset>
			{#if kind !== 'tag'}
				<label class="flex min-h-8 w-fit items-center gap-2 text-sm font-medium">
					<input
						type="checkbox"
						name="isDefault"
						value="true"
						checked={item?.isDefault}
						class="size-4 accent-primary"
					/>
					{m.priority_set_default()}
				</label>
			{/if}
			{#if kind === 'environment'}
				<div class="grid gap-3 lg:grid-cols-2">
					{#each [{ key: 'baseUrl', label: m.env_base_url(), limit: 500, placeholder: m.env_base_url_placeholder() }, { key: 'credentials', label: m.env_credentials(), limit: 1000, placeholder: '' }] as field (field.key)}
						{@const key = field.key as 'baseUrl' | 'credentials'}
						<div class="min-w-0 space-y-1">
							<label for={action + '-' + key} class="block text-sm font-medium">{field.label}</label
							>
							<Input
								id={action + '-' + key}
								name={key}
								value={item?.[key] ?? ''}
								maxlength={field.limit}
								placeholder={field.placeholder}
								aria-invalid={failure?.field === key || undefined}
								aria-describedby={failure?.field === key ? feedbackId : undefined}
							/>
						</div>
					{/each}
					<div class="min-w-0 space-y-1 lg:col-span-2">
						<label for={action + '-memo'} class="block text-sm font-medium">{m.env_memo()}</label>
						<Textarea
							id={action + '-memo'}
							name="memo"
							value={item?.memo ?? ''}
							rows={2}
							maxlength={2000}
							aria-invalid={failure?.field === 'memo' || undefined}
							aria-describedby={failure?.field === 'memo' ? feedbackId : undefined}
						/>
					</div>
				</div>
			{/if}
		</fieldset>
		<div class="flex flex-wrap gap-2">
			<Button type="submit" class="w-full sm:w-auto" disabled={pending !== null}>
				{pending === action ? m.common_saving() : item ? m.common_save_changes() : labels.add()}
			</Button>
			{#if item}<Button
					type="button"
					variant="outline"
					class="w-full sm:w-auto"
					disabled={pending !== null}
					onclick={stopEdit}>{m.common_cancel()}</Button
				>{/if}
		</div>
	</form>
{/snippet}

{#snippet itemLabel(item: Item)}
	<span class="inline-flex min-w-0 items-center gap-2 font-medium [overflow-wrap:anywhere]">
		<span
			aria-hidden="true"
			class="size-3 shrink-0 rounded-full border border-foreground/30"
			style:background-color={item.color}
		></span>
		<span class="min-w-0">{item.name}</span>
	</span>
	{#if item.isDefault}<span
			class="rounded bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
			>{m.priority_is_default()}</span
		>{/if}
{/snippet}

<div class="space-y-4">
	<PageHeader
		title={labels.title()}
		description={canEdit ? labels.desc() : m.settings_catalog_readonly()}
	/>
	{#if canEdit}
		<div class="rounded-xl border bg-card p-4 sm:p-6">{@render fields('create')}</div>
	{/if}
	{#if items.length === 0}
		<p class="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
			{canEdit ? labels.empty() : m.common_no_results()}
		</p>
	{:else}
		<ul aria-label={labels.title()} class="divide-y rounded-xl border bg-card">
			{#each items as item (item.id)}
				<li class="min-w-0 p-4">
					{#if canEdit && editing?.id === item.id}
						{@render fields('update', editing)}
					{:else}
						<div class="flex flex-wrap items-start justify-between gap-3">
							{#if item.baseUrl || item.credentials || item.memo}
								<details class="min-w-0 basis-full sm:flex-1">
									<summary
										class="cursor-pointer rounded-sm py-1 text-sm focus-visible:outline-2 focus-visible:outline-ring"
									>
										{@render itemLabel(item)}
									</summary>
									<dl class="mt-3 space-y-2 border-s pl-3 text-sm [overflow-wrap:anywhere]">
										{#each [{ value: item.baseUrl, label: m.env_base_url() }, { value: item.credentials, label: m.env_credentials() }, { value: item.memo, label: m.env_memo() }] as detail}
											{#if detail.value}
												<div>
													<dt class="text-muted-foreground">{detail.label}</dt>
													<dd class="whitespace-pre-wrap">{detail.value}</dd>
												</div>
											{/if}
										{/each}
									</dl>
								</details>
							{:else}
								<div class="flex min-w-0 flex-1 flex-wrap items-center gap-2 py-1 text-sm">
									{@render itemLabel(item)}
								</div>
							{/if}
							{#if canEdit}
								<div class="flex w-full flex-wrap gap-2 sm:w-auto">
									<Button
										id={`edit-setting-${item.id}`}
										type="button"
										size="sm"
										variant="outline"
										aria-label={m.settings_catalog_item_action({
											action: m.common_edit(),
											name: item.name
										})}
										disabled={pending !== null}
										onclick={() => startEdit(item)}>{m.common_edit()}</Button
									>
									<Button
										type="button"
										size="sm"
										variant="outline"
										aria-label={m.settings_catalog_item_action({
											action: m.common_delete(),
											name: item.name
										})}
										disabled={pending !== null}
										onclick={(event) => startDelete(item, event.currentTarget)}
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

	<AlertDialog.Root bind:open={deleteOpen}>
		{#if deleting}
			<AlertDialog.Content
				onCloseAutoFocus={deleteClosed}
				escapeKeydownBehavior={pending ? 'ignore' : 'close'}
			>
				<AlertDialog.Header>
					<AlertDialog.Title>{labels.deleteTitle()}</AlertDialog.Title>
					<AlertDialog.Description class="[overflow-wrap:anywhere]"
						>{labels.deleteConfirm({ name: deleting.name })}</AlertDialog.Description
					>
				</AlertDialog.Header>
				{#if failures.delete}<p
						role="alert"
						tabindex="-1"
						bind:this={deleteError}
						class="text-sm text-destructive"
					>
						{failures.delete.message}
					</p>{/if}
				<AlertDialog.Footer>
					<AlertDialog.Cancel disabled={pending !== null}>{m.common_cancel()}</AlertDialog.Cancel>
					<form method="POST" action="?/delete" use:enhance={submission('delete')}>
						<input type="hidden" name={labels.id} value={deleting.id} />
						<Button
							type="submit"
							variant="destructive"
							class="w-full sm:w-auto"
							disabled={pending !== null}
						>
							{pending === 'delete' ? m.common_saving() : m.common_delete()}
						</Button>
					</form>
				</AlertDialog.Footer>
			</AlertDialog.Content>
		{/if}
	</AlertDialog.Root>
</div>
