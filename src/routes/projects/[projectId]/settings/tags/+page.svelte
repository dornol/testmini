<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { toast } from 'svelte-sonner';
	import TagBadge from '$lib/components/TagBadge.svelte';
	import * as m from '$lib/paraglide/messages.js';
	import { TAG_PALETTE } from '$lib/constants';

	let { data } = $props();

	const canEdit = $derived(data.userRole !== 'VIEWER');

	let newName = $state('');
	let newColor = $state(TAG_PALETTE[0]);
	let editingId = $state<number | null>(null);
	let editName = $state('');
	let editColor = $state('');
	let deleteTag = $state<{ id: number; name: string } | null>(null);

	function startEdit(tag: { id: number; name: string; color: string }) {
		editingId = tag.id;
		editName = tag.name;
		editColor = tag.color;
	}

	function cancelEdit() {
		editingId = null;
		editName = '';
		editColor = '';
	}
</script>

<div class="space-y-4">
	<div>
		<h3 class="text-lg font-semibold">{m.tag_title()}</h3>
		<p class="text-muted-foreground text-sm">{m.tag_desc()}</p>
	</div>

	{#if canEdit}
		<Card.Root>
			<Card.Header>
				<Card.Title class="text-base">{m.tag_new()}</Card.Title>
			</Card.Header>
			<Card.Content>
				<form
					method="POST"
					action="?/create"
					use:enhance={() => {
						return async ({ result, update }) => {
							if (result.type === 'success') {
								toast.success(m.tag_created());
								newName = '';
								newColor = TAG_PALETTE[0];
								await update();
							} else if (result.type === 'failure' && result.data?.duplicate) {
								toast.error(m.tag_duplicate());
							}
						};
					}}
					class="flex items-end gap-3"
				>
					<div class="flex-1 space-y-2">
						<Label for="tag-name">{m.tag_name()}</Label>
						<Input
							id="tag-name"
							name="name"
							placeholder={m.tag_name_placeholder()}
							bind:value={newName}
							required
						/>
					</div>
					<div class="space-y-2">
						<Label>{m.tag_color()}</Label>
						<div class="flex gap-1">
							{#each TAG_PALETTE as color (color)}
								<button
									type="button"
									class="h-7 w-7 rounded-full border-2 transition-transform {newColor === color ? 'scale-110 border-foreground' : 'border-transparent'}"
									style="background-color: {color}"
									onclick={() => (newColor = color)}
									aria-label={color}
								></button>
							{/each}
						</div>
					</div>
					<input type="hidden" name="color" value={newColor} />
					<Button type="submit" disabled={!newName.trim()}>{m.tag_new()}</Button>
				</form>
			</Card.Content>
		</Card.Root>
	{/if}

	{#if data.tags.length === 0}
		<div class="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
			<p class="text-muted-foreground text-sm">{m.tag_empty()}</p>
		</div>
	{:else}
		<Card.Root>
			<Card.Content class="pt-6">
				<div class="space-y-2">
					{#each data.tags as t (t.id)}
						<div class="flex items-center justify-between rounded-md border px-4 py-3">
							{#if editingId === t.id}
								<form
									method="POST"
									action="?/update"
									use:enhance={() => {
										return async ({ result, update }) => {
											if (result.type === 'success') {
												toast.success(m.tag_updated());
												cancelEdit();
												await update();
											} else if (result.type === 'failure' && result.data?.duplicate) {
												toast.error(m.tag_duplicate());
											}
										};
									}}
									class="flex flex-1 items-center gap-3"
								>
									<input type="hidden" name="tagId" value={t.id} />
									<Input
										name="name"
										bind:value={editName}
										class="max-w-xs"
										required
									/>
									<div class="flex gap-1">
										{#each TAG_PALETTE as color (color)}
											<button
												type="button"
												class="h-6 w-6 rounded-full border-2 {editColor === color ? 'border-foreground' : 'border-transparent'}"
												style="background-color: {color}"
												onclick={() => (editColor = color)}
												aria-label={color}
											></button>
										{/each}
									</div>
									<input type="hidden" name="color" value={editColor} />
									<Button type="submit" size="sm">{m.common_save_changes()}</Button>
									<Button type="button" variant="outline" size="sm" onclick={cancelEdit}>{m.common_cancel()}</Button>
								</form>
							{:else}
								<div class="flex items-center gap-3">
									<TagBadge name={t.name} color={t.color} />
								</div>
								{#if canEdit}
									<div class="flex gap-2">
										<Button variant="outline" size="sm" onclick={() => startEdit(t)}>{m.common_edit()}</Button>
										<Button variant="outline" size="sm" onclick={() => (deleteTag = { id: t.id, name: t.name })}>{m.common_delete()}</Button>
									</div>
								{/if}
							{/if}
						</div>
					{/each}
				</div>
			</Card.Content>
		</Card.Root>
	{/if}

	<AlertDialog.Root open={!!deleteTag} onOpenChange={(open) => { if (!open) deleteTag = null; }}>
		<AlertDialog.Portal>
			<AlertDialog.Overlay />
			<AlertDialog.Content>
				<AlertDialog.Header>
					<AlertDialog.Title>{m.tag_delete_title()}</AlertDialog.Title>
					<AlertDialog.Description>
						{m.tag_delete_confirm({ name: deleteTag?.name ?? '' })}
					</AlertDialog.Description>
				</AlertDialog.Header>
				<AlertDialog.Footer>
					<AlertDialog.Cancel>{m.common_cancel()}</AlertDialog.Cancel>
					<form
						method="POST"
						action="?/delete"
						use:enhance={() => {
							return async ({ result, update }) => {
								if (result.type === 'success') {
									toast.success(m.tag_deleted());
									deleteTag = null;
									await update();
								}
							};
						}}
					>
						<input type="hidden" name="tagId" value={deleteTag?.id ?? ''} />
						<Button type="submit" variant="destructive">{m.common_delete()}</Button>
					</form>
				</AlertDialog.Footer>
			</AlertDialog.Content>
		</AlertDialog.Portal>
	</AlertDialog.Root>
</div>
