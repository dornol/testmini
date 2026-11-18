<script lang="ts">
	import { tick } from 'svelte';
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import NameDescriptionForm from '$lib/components/NameDescriptionForm.svelte';
	import PageHeader from '$lib/components/patterns/PageHeader.svelte';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { Button } from '$lib/components/ui/button';
	import * as m from '$lib/paraglide/messages.js';

	let { data, form } = $props();
	const canManage = $derived(data.userTeamRole === 'OWNER' || data.userTeamRole === 'ADMIN');
	const detailsForm = $derived(
		form?.form && typeof form.form.data.name === 'string'
			? {
					...form.form,
					data: { name: form.form.data.name, description: form.form.data.description ?? '' }
				}
			: data.form
	);
	let deleteOpen = $state(false);
	let deleting = $state(false);
	let failed = $state(false);
	let feedback = $state<HTMLElement | null>(null);

	const submitDelete: SubmitFunction = ({ cancel }) => {
		if (deleting) {
			cancel();
			return;
		}
		deleting = true;
		failed = false;
		return async ({ result, update }) => {
			try {
				if (result.type === 'redirect') await update();
				else {
					failed = true;
					await tick();
					feedback?.focus();
				}
			} finally {
				deleting = false;
			}
		};
	};
</script>

<div class="space-y-4">
	<PageHeader
		title={m.team_general()}
		description={canManage ? undefined : m.team_settings_readonly()}
	/>
	{#if canManage}
		<NameDescriptionForm initial={detailsForm} action="?/update" team editing guard={!deleting} />
	{:else}
		<dl class="space-y-3 rounded-xl border bg-card p-4 [overflow-wrap:anywhere]">
			<div>
				<dt class="text-sm text-muted-foreground">{m.team_name()}</dt>
				<dd class="font-medium">{data.team.name}</dd>
			</div>
			<div>
				<dt class="text-sm text-muted-foreground">{m.team_desc()}</dt>
				<dd class="whitespace-pre-wrap">{data.team.description || '—'}</dd>
			</div>
		</dl>
	{/if}

	{#if data.canDeleteTeam}
		<section
			aria-labelledby="team-danger-zone"
			class="space-y-3 rounded-xl border border-destructive/40 bg-card p-4"
		>
			<h3 id="team-danger-zone" class="font-semibold text-destructive">
				{m.settings_danger_zone()}
			</h3>
			<p class="text-sm text-muted-foreground">{m.team_delete_effect()}</p>
			<AlertDialog.Root
				bind:open={deleteOpen}
				onOpenChange={(open) => {
					if (open) failed = false;
				}}
			>
				<AlertDialog.Trigger>
					{#snippet child({ props })}
						<Button variant="destructive" class="w-full sm:w-auto" {...props}
							>{m.team_delete_title()}</Button
						>
					{/snippet}
				</AlertDialog.Trigger>
				<AlertDialog.Content escapeKeydownBehavior={deleting ? 'ignore' : 'close'}>
					<AlertDialog.Header>
						<AlertDialog.Title>{m.team_delete_title()}</AlertDialog.Title>
						<AlertDialog.Description class="[overflow-wrap:anywhere]">
							{m.team_delete_named({ name: data.team.name })}
						</AlertDialog.Description>
					</AlertDialog.Header>
					{#if failed || form?.deleteFailed}
						<p role="alert" tabindex="-1" bind:this={feedback} class="text-sm text-destructive">
							{m.error_remove_failed()}
						</p>
					{/if}
					<AlertDialog.Footer>
						<AlertDialog.Cancel disabled={deleting}>{m.common_cancel()}</AlertDialog.Cancel>
						<form method="POST" action="?/delete" use:enhance={submitDelete}>
							<Button
								type="submit"
								variant="destructive"
								disabled={deleting}
								class="w-full sm:w-auto">{deleting ? m.common_saving() : m.common_delete()}</Button
							>
						</form>
					</AlertDialog.Footer>
				</AlertDialog.Content>
			</AlertDialog.Root>
		</section>
	{/if}
</div>
