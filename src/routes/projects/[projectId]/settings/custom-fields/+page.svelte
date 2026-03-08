<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { invalidateAll } from '$app/navigation';
	import { apiFetch, apiPost, apiPatch, apiDelete } from '$lib/api-client';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import * as m from '$lib/paraglide/messages.js';

	let { data } = $props();

	const isAdmin = $derived(data.userRole === 'PROJECT_ADMIN' || data.userRole === 'ADMIN');
	const baseUrl = $derived(`/api/projects/${data.project.id}/custom-fields`);

	const FIELD_TYPES = ['TEXT', 'NUMBER', 'SELECT', 'MULTISELECT', 'DATE', 'CHECKBOX', 'URL'] as const;

	const typeLabels: Record<string, () => string> = {
		TEXT: m.custom_field_type_TEXT,
		NUMBER: m.custom_field_type_NUMBER,
		SELECT: m.custom_field_type_SELECT,
		MULTISELECT: m.custom_field_type_MULTISELECT,
		DATE: m.custom_field_type_DATE,
		CHECKBOX: m.custom_field_type_CHECKBOX,
		URL: m.custom_field_type_URL
	};

	let newName = $state('');
	let newType = $state<string>('TEXT');
	let newOptions = $state('');
	let newRequired = $state(false);
	let creating = $state(false);

	let deleteTarget = $state<{ id: number; name: string } | null>(null);

	const needsOptions = $derived(newType === 'SELECT' || newType === 'MULTISELECT');

	async function createField() {
		if (!newName.trim()) return;
		creating = true;
		try {
			const options = needsOptions
				? newOptions.split('\n').map((o) => o.trim()).filter(Boolean)
				: undefined;
			await apiPost(baseUrl, {
				name: newName.trim(),
				fieldType: newType,
				options,
				required: newRequired
			});
			toast.success(m.custom_field_created());
			newName = '';
			newType = 'TEXT';
			newOptions = '';
			newRequired = false;
			await invalidateAll();
		} finally {
			creating = false;
		}
	}

	async function deleteField() {
		if (!deleteTarget) return;
		try {
			await apiDelete(`${baseUrl}/${deleteTarget.id}`);
			toast.success(m.custom_field_deleted());
			deleteTarget = null;
			await invalidateAll();
		} catch {
			deleteTarget = null;
		}
	}
</script>

<div class="space-y-4">
	<div>
		<h3 class="text-lg font-semibold">{m.custom_field_title()}</h3>
		<p class="text-muted-foreground text-sm">{m.custom_field_desc()}</p>
	</div>

	{#if isAdmin}
		<Card.Root>
			<Card.Header>
				<Card.Title class="text-base">{m.custom_field_new()}</Card.Title>
			</Card.Header>
			<Card.Content>
				<div class="space-y-3">
					<div class="flex items-end gap-3">
						<div class="flex-1 space-y-2">
							<Label for="cf-name">{m.custom_field_name()}</Label>
							<Input
								id="cf-name"
								placeholder={m.custom_field_name_placeholder()}
								bind:value={newName}
							/>
						</div>
						<div class="w-40 space-y-2">
							<Label for="cf-type">{m.custom_field_type()}</Label>
							<select
								id="cf-type"
								bind:value={newType}
								class="border-input bg-background flex h-9 w-full rounded-md border px-3 py-1 text-sm"
							>
								{#each FIELD_TYPES as ft (ft)}
									<option value={ft}>{typeLabels[ft]()}</option>
								{/each}
							</select>
						</div>
					</div>

					{#if needsOptions}
						<div class="space-y-2">
							<Label for="cf-options">{m.custom_field_options()}</Label>
							<textarea
								id="cf-options"
								bind:value={newOptions}
								placeholder={m.custom_field_options_placeholder()}
								rows="3"
								class="border-input bg-background flex w-full rounded-md border px-3 py-2 text-sm"
							></textarea>
						</div>
					{/if}

					<div class="flex items-center justify-between">
						<label class="flex items-center gap-2 text-sm">
							<input type="checkbox" bind:checked={newRequired} class="h-4 w-4 rounded border-gray-300" />
							{m.custom_field_required()}
						</label>
						<Button onclick={createField} disabled={!newName.trim() || creating}>
							{creating ? m.common_creating() : m.custom_field_new()}
						</Button>
					</div>
				</div>
			</Card.Content>
		</Card.Root>
	{/if}

	{#if data.customFields.length === 0}
		<div class="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
			<p class="text-muted-foreground text-sm">{m.custom_field_empty()}</p>
		</div>
	{:else}
		<Card.Root>
			<Card.Content class="pt-6">
				<div class="space-y-2">
					{#each data.customFields as field (field.id)}
						<div class="flex items-center justify-between rounded-md border px-4 py-3">
							<div class="flex items-center gap-3">
								<span class="font-medium">{field.name}</span>
								<Badge variant="outline" class="text-xs">{typeLabels[field.fieldType]?.() ?? field.fieldType}</Badge>
								{#if field.required}
									<Badge variant="secondary" class="text-xs">{m.custom_field_required()}</Badge>
								{/if}
								{#if field.options && Array.isArray(field.options) && field.options.length > 0}
									<span class="text-muted-foreground text-xs">{field.options.join(', ')}</span>
								{/if}
							</div>
							{#if isAdmin}
								<Button
									variant="outline"
									size="sm"
									onclick={() => (deleteTarget = { id: field.id, name: field.name })}
								>
									{m.common_delete()}
								</Button>
							{/if}
						</div>
					{/each}
				</div>
			</Card.Content>
		</Card.Root>
	{/if}
</div>

<AlertDialog.Root open={!!deleteTarget} onOpenChange={(open) => { if (!open) deleteTarget = null; }}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{m.custom_field_delete_title()}</AlertDialog.Title>
			<AlertDialog.Description>
				{m.custom_field_delete_confirm({ name: deleteTarget?.name ?? '' })}
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>{m.common_cancel()}</AlertDialog.Cancel>
			<AlertDialog.Action onclick={deleteField}>{m.common_delete()}</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
