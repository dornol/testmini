<script lang="ts">
	import { enhance } from '$app/forms';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { toast } from 'svelte-sonner';
	import * as m from '$lib/paraglide/messages.js';

	let { data } = $props();

	const canEdit = $derived(data.userRole !== 'VIEWER');

	const PALETTE = [
		'#3b82f6', '#8b5cf6', '#f97316', '#ef4444', '#6b7280',
		'#22c55e', '#14b8a6', '#eab308', '#ec4899', '#6366f1'
	];

	let newName = $state('');
	let newColor = $state(PALETTE[0]);
	let newIsDefault = $state(false);
	let newBaseUrl = $state('');
	let newCredentials = $state('');
	let newMemo = $state('');
	let editingId = $state<number | null>(null);
	let editName = $state('');
	let editColor = $state('');
	let editIsDefault = $state(false);
	let editBaseUrl = $state('');
	let editCredentials = $state('');
	let editMemo = $state('');
	let deleteEnv = $state<{ id: number; name: string } | null>(null);
	let expandedId = $state<number | null>(null);

	function startEdit(env: { id: number; name: string; color: string; isDefault: boolean; baseUrl: string | null; credentials: string | null; memo: string | null }) {
		editingId = env.id;
		editName = env.name;
		editColor = env.color;
		editIsDefault = env.isDefault;
		editBaseUrl = env.baseUrl ?? '';
		editCredentials = env.credentials ?? '';
		editMemo = env.memo ?? '';
		expandedId = null;
	}

	function cancelEdit() {
		editingId = null;
		editName = '';
		editColor = '';
		editIsDefault = false;
		editBaseUrl = '';
		editCredentials = '';
		editMemo = '';
	}

	function toggleExpand(id: number) {
		expandedId = expandedId === id ? null : id;
	}

	function hasDetails(env: { baseUrl: string | null; credentials: string | null; memo: string | null }) {
		return env.baseUrl || env.credentials || env.memo;
	}
</script>

<div class="space-y-4">
	<div>
		<h3 class="text-lg font-semibold">{m.env_title()}</h3>
		<p class="text-muted-foreground text-sm">{m.env_desc()}</p>
	</div>

	{#if canEdit}
		<Card.Root>
			<Card.Header>
				<Card.Title class="text-base">{m.env_new()}</Card.Title>
			</Card.Header>
			<Card.Content>
				<form
					method="POST"
					action="?/create"
					use:enhance={() => {
						return async ({ result, update }) => {
							if (result.type === 'success') {
								toast.success(m.env_created());
								newName = '';
								newColor = PALETTE[0];
								newIsDefault = false;
								newBaseUrl = '';
								newCredentials = '';
								newMemo = '';
								await update();
							} else if (result.type === 'failure' && result.data?.duplicate) {
								toast.error(m.env_duplicate());
							}
						};
					}}
					class="space-y-4"
				>
					<div class="flex items-end gap-3">
						<div class="flex-1 space-y-2">
							<Label for="env-name">{m.env_name()}</Label>
							<Input
								id="env-name"
								name="name"
								placeholder={m.env_name_placeholder()}
								bind:value={newName}
								required
							/>
						</div>
						<div class="space-y-2">
							<Label>{m.env_color()}</Label>
							<div class="flex gap-1">
								{#each PALETTE as color (color)}
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
						<input type="hidden" name="isDefault" value={String(newIsDefault)} />
						<label class="flex items-center gap-2 text-sm whitespace-nowrap pb-1">
							<Checkbox bind:checked={newIsDefault} />
							{m.env_is_default()}
						</label>
					</div>

					<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
						<div class="space-y-2">
							<Label for="new-base-url">{m.env_base_url()}</Label>
							<Input
								id="new-base-url"
								name="baseUrl"
								placeholder={m.env_base_url_placeholder()}
								bind:value={newBaseUrl}
							/>
						</div>
						<div class="space-y-2">
							<Label for="new-credentials">{m.env_credentials()}</Label>
							<Input
								id="new-credentials"
								name="credentials"
								placeholder={m.env_credentials_placeholder()}
								bind:value={newCredentials}
							/>
						</div>
					</div>
					<div class="space-y-2">
						<Label for="new-memo">{m.env_memo()}</Label>
						<Textarea
							id="new-memo"
							name="memo"
							placeholder={m.env_memo_placeholder()}
							bind:value={newMemo}
							rows={2}
						/>
					</div>

					<Button type="submit" disabled={!newName.trim()}>{m.env_new()}</Button>
				</form>
			</Card.Content>
		</Card.Root>
	{/if}

	{#if data.environments.length === 0}
		<div class="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
			<p class="text-muted-foreground text-sm">{m.env_empty()}</p>
		</div>
	{:else}
		<Card.Root>
			<Card.Content class="pt-6">
				<div class="space-y-2">
					{#each data.environments as env (env.id)}
						{#if editingId === env.id}
							<div class="rounded-md border px-4 py-3">
								<form
									method="POST"
									action="?/update"
									use:enhance={() => {
										return async ({ result, update }) => {
											if (result.type === 'success') {
												toast.success(m.env_updated());
												cancelEdit();
												await update();
											} else if (result.type === 'failure' && result.data?.duplicate) {
												toast.error(m.env_duplicate());
											}
										};
									}}
									class="space-y-4"
								>
									<input type="hidden" name="environmentId" value={env.id} />
									<div class="flex items-center gap-3">
										<Input
											name="name"
											bind:value={editName}
											class="max-w-xs"
											required
										/>
										<div class="flex gap-1">
											{#each PALETTE as color (color)}
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
										<input type="hidden" name="isDefault" value={String(editIsDefault)} />
										<label class="flex items-center gap-2 text-sm whitespace-nowrap">
											<Checkbox bind:checked={editIsDefault} />
											{m.env_is_default()}
										</label>
									</div>

									<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
										<div class="space-y-2">
											<Label>{m.env_base_url()}</Label>
											<Input
												name="baseUrl"
												placeholder={m.env_base_url_placeholder()}
												bind:value={editBaseUrl}
											/>
										</div>
										<div class="space-y-2">
											<Label>{m.env_credentials()}</Label>
											<Input
												name="credentials"
												placeholder={m.env_credentials_placeholder()}
												bind:value={editCredentials}
											/>
										</div>
									</div>
									<div class="space-y-2">
										<Label>{m.env_memo()}</Label>
										<Textarea
											name="memo"
											placeholder={m.env_memo_placeholder()}
											bind:value={editMemo}
											rows={2}
										/>
									</div>

									<div class="flex gap-2">
										<Button type="submit" size="sm">{m.common_save_changes()}</Button>
										<Button type="button" variant="outline" size="sm" onclick={cancelEdit}>{m.common_cancel()}</Button>
									</div>
								</form>
							</div>
						{:else}
							<div class="rounded-md border px-4 py-3">
								<div class="flex items-center justify-between">
									<button
										type="button"
										class="flex items-center gap-3"
										onclick={() => toggleExpand(env.id)}
									>
										<Badge style="background-color: {env.color}; color: white">{env.name}</Badge>
										{#if env.isDefault}
											<span class="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
												{m.env_is_default()}
											</span>
										{/if}
										{#if hasDetails(env)}
											<svg
												class="h-4 w-4 text-muted-foreground transition-transform {expandedId === env.id ? 'rotate-180' : ''}"
												xmlns="http://www.w3.org/2000/svg"
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												stroke-width="2"
												stroke-linecap="round"
												stroke-linejoin="round"
											>
												<polyline points="6 9 12 15 18 9"></polyline>
											</svg>
										{/if}
									</button>
									{#if canEdit}
										<div class="flex gap-2">
											<Button variant="outline" size="sm" onclick={() => startEdit(env)}>{m.common_edit()}</Button>
											<Button variant="outline" size="sm" onclick={() => (deleteEnv = { id: env.id, name: env.name })}>{m.common_delete()}</Button>
										</div>
									{/if}
								</div>
								{#if expandedId === env.id}
									<div class="mt-3 border-t pt-3">
										{#if hasDetails(env)}
											<dl class="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
												{#if env.baseUrl}
													<div>
														<dt class="text-muted-foreground font-medium">{m.env_base_url()}</dt>
														<dd class="font-mono text-xs break-all">{env.baseUrl}</dd>
													</div>
												{/if}
												{#if env.credentials}
													<div>
														<dt class="text-muted-foreground font-medium">{m.env_credentials()}</dt>
														<dd class="font-mono text-xs break-all">{env.credentials}</dd>
													</div>
												{/if}
												{#if env.memo}
													<div class="sm:col-span-2">
														<dt class="text-muted-foreground font-medium">{m.env_memo()}</dt>
														<dd class="whitespace-pre-wrap text-xs">{env.memo}</dd>
													</div>
												{/if}
											</dl>
										{:else}
											<p class="text-muted-foreground text-xs">{m.env_no_details()}</p>
										{/if}
									</div>
								{/if}
							</div>
						{/if}
					{/each}
				</div>
			</Card.Content>
		</Card.Root>
	{/if}

	<AlertDialog.Root open={!!deleteEnv} onOpenChange={(open) => { if (!open) deleteEnv = null; }}>
		<AlertDialog.Portal>
			<AlertDialog.Overlay />
			<AlertDialog.Content>
				<AlertDialog.Header>
					<AlertDialog.Title>{m.env_delete_title()}</AlertDialog.Title>
					<AlertDialog.Description>
						{m.env_delete_confirm({ name: deleteEnv?.name ?? '' })}
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
									toast.success(m.env_deleted());
									deleteEnv = null;
									await update();
								}
							};
						}}
					>
						<input type="hidden" name="environmentId" value={deleteEnv?.id ?? ''} />
						<Button type="submit" variant="destructive">{m.common_delete()}</Button>
					</form>
				</AlertDialog.Footer>
			</AlertDialog.Content>
		</AlertDialog.Portal>
	</AlertDialog.Root>
</div>
