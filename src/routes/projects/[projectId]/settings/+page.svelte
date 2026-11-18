<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import NameDescriptionForm from '$lib/components/NameDescriptionForm.svelte';
	import PageHeader from '$lib/components/patterns/PageHeader.svelte';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { Button } from '$lib/components/ui/button';
	import * as m from '$lib/paraglide/messages.js';

	let { data, form } = $props();
	const canManage = $derived(data.userRole === 'PROJECT_ADMIN' || data.userRole === 'ADMIN');
	let deactivateOpen = $state(false);
	let signoff = $state(untrack(() => data.requireSignoff));
	let pending = $state<'signoff' | 'deactivate' | null>(null);
	let failed = $state<typeof pending>(null);
	let deactivateFeedback = $state<HTMLElement | null>(null);

	function submitAction(kind: 'signoff' | 'deactivate'): SubmitFunction {
		return ({ cancel }) => {
			if (pending) {
				cancel();
				return;
			}
			pending = kind;
			failed = null;
			return async ({ result, update }) => {
				try {
					if (result.type === 'success' && typeof result.data?.requireSignoff === 'boolean') {
						signoff = result.data.requireSignoff;
					} else if (result.type === 'redirect') {
						await update();
					} else {
						failed = kind;
						if (kind === 'deactivate') {
							await tick();
							deactivateFeedback?.focus();
						}
					}
				} finally {
					pending = null;
				}
			};
		};
	}
</script>

<div class="space-y-4">
	<PageHeader
		title={m.settings_general()}
		description={canManage ? m.settings_general_desc() : m.settings_general_readonly()}
	/>
	{#if canManage}
		<NameDescriptionForm
			initial={form?.form ?? data.form}
			action="?/update"
			editing
			guard={pending !== 'deactivate'}
		/>
	{:else}
		<dl class="space-y-3 rounded-xl border bg-card p-4 [overflow-wrap:anywhere]">
			<div>
				<dt class="text-sm text-muted-foreground">{m.project_name_label()}</dt>
				<dd class="font-medium">{data.project.name}</dd>
			</div>
			<div>
				<dt class="text-sm text-muted-foreground">{m.common_description()}</dt>
				<dd class="whitespace-pre-wrap">{data.project.description || '—'}</dd>
			</div>
		</dl>
	{/if}

	<section aria-labelledby="project-signoff" class="space-y-2 rounded-xl border bg-card p-4">
		<div class="flex flex-wrap items-center justify-between gap-3">
			<h3 id="project-signoff" class="min-w-0 text-sm font-medium">
				{m.settings_require_signoff()}
			</h3>
			{#if canManage}
				<form method="POST" action="?/toggleSignoff" use:enhance={submitAction('signoff')}>
					<Button
						type="submit"
						role="switch"
						aria-checked={signoff}
						aria-labelledby="project-signoff"
						aria-disabled={pending !== null}
						variant={signoff ? 'default' : 'outline'}
					>
						<span aria-hidden="true">{signoff ? m.common_active() : m.common_inactive()}</span>
					</Button>
				</form>
			{:else}
				<p class="text-sm text-muted-foreground">
					{signoff ? m.common_active() : m.common_inactive()}
				</p>
			{/if}
		</div>
		{#if pending === 'signoff'}<p role="status" class="text-sm text-muted-foreground">
				{m.common_saving()}
			</p>{/if}
		{#if failed === 'signoff'}<p role="alert" class="text-sm text-destructive">
				{m.ui_save_failed()}
			</p>{/if}
	</section>

	{#if canManage && data.project.active}
		<section
			aria-labelledby="project-deactivation"
			class="space-y-3 rounded-xl border border-destructive/40 bg-card p-4"
		>
			<h3 id="project-deactivation" class="font-semibold text-destructive">
				{m.settings_danger_zone()}
			</h3>
			<p class="text-sm text-muted-foreground">{m.settings_deactivate_desc()}</p>
			<AlertDialog.Root
				bind:open={deactivateOpen}
				onOpenChange={(open) => {
					if (open) failed = null;
				}}
			>
				<AlertDialog.Trigger>
					{#snippet child({ props })}
						<Button variant="destructive" class="w-full sm:w-auto" {...props}>
							{m.settings_deactivate()}
						</Button>
					{/snippet}
				</AlertDialog.Trigger>
				<AlertDialog.Content escapeKeydownBehavior={pending === 'deactivate' ? 'ignore' : 'close'}>
					<AlertDialog.Header>
						<AlertDialog.Title>{m.settings_deactivate_title()}</AlertDialog.Title>
						<AlertDialog.Description class="[overflow-wrap:anywhere]">
							{m.settings_deactivate_confirm({ name: data.project.name })}
						</AlertDialog.Description>
					</AlertDialog.Header>
					{#if failed === 'deactivate'}
						<p
							role="alert"
							tabindex="-1"
							bind:this={deactivateFeedback}
							class="text-sm text-destructive"
						>
							{m.settings_deactivate_failed()}
						</p>
					{/if}
					<AlertDialog.Footer>
						<AlertDialog.Cancel class="w-full sm:w-auto" disabled={pending === 'deactivate'}>
							{m.common_cancel()}
						</AlertDialog.Cancel>
						<form
							class="w-full sm:w-auto"
							method="POST"
							action="?/deactivate"
							use:enhance={submitAction('deactivate')}
						>
							<Button
								type="submit"
								variant="destructive"
								class="w-full sm:w-auto"
								disabled={pending !== null}
							>
								{pending === 'deactivate' ? m.common_saving() : m.settings_deactivate()}
							</Button>
						</form>
					</AlertDialog.Footer>
				</AlertDialog.Content>
			</AlertDialog.Root>
		</section>
	{/if}
</div>
