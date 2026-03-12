<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto, invalidateAll } from '$app/navigation';
	import { tick } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { apiPatch, apiPost, apiDelete } from '$lib/api-client';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import * as m from '$lib/paraglide/messages.js';

	interface Props {
		run: {
			id: number;
			name: string;
			environment: string;
			status: string;
			retestOfRunId: number | null;
		};
		stats: {
			total: number;
			pending: number;
			pass: number;
			fail: number;
			blocked: number;
			skipped: number;
		};
		projectId: number;
		basePath: string;
		canExecute: boolean;
		isAdmin: boolean;
		sseConnected: boolean;
		completedPct: number;
		projectEnvironments: Array<{ id: number; name: string; color: string; baseUrl?: string | null; credentials?: string | null; memo?: string | null }>;
		onresult: (result: { type: string; data?: Record<string, unknown> }) => void;
	}

	let {
		run,
		stats,
		projectId,
		basePath,
		canExecute,
		isAdmin,
		sseConnected,
		completedPct,
		projectEnvironments,
		onresult
	}: Props = $props();

	const environments = $derived(projectEnvironments.length > 0 ? projectEnvironments : [{ id: 0, name: run.environment, color: '#6b7280' }]);
	const currentEnv = $derived(projectEnvironments.find(e => e.name === run.environment));
	const hasEnvDetails = $derived(currentEnv?.baseUrl || currentEnv?.credentials || currentEnv?.memo);

	// Edit run dialog state
	let editRunDialogOpen = $state(false);
	let editRunName = $state('');
	let editRunEnv = $state('');
	let editRunSaving = $state(false);

	// Clone run dialog state
	let cloneDialogOpen = $state(false);
	let cloneRunName = $state('');
	let cloneRunSaving = $state(false);

	// Retest run dialog state
	let retestDialogOpen = $state(false);
	let retestRunName = $state('');
	let retestRunSaving = $state(false);

	// Delete run dialog state
	let deleteRunDialogOpen = $state(false);
	let deleteRunSaving = $state(false);

	function statusVariant(s: string): 'default' | 'secondary' | 'outline' | 'destructive' {
		switch (s) {
			case 'COMPLETED':
				return 'default';
			case 'IN_PROGRESS':
				return 'secondary';
			default:
				return 'outline';
		}
	}

	function openEditRun() {
		editRunName = run.name;
		editRunEnv = run.environment;
		editRunDialogOpen = true;
	}

	async function handleEditRun() {
		editRunSaving = true;
		try {
			await apiPatch(`/api/projects/${projectId}/test-runs/${run.id}`, { name: editRunName, environment: editRunEnv });
			editRunDialogOpen = false;
			toast.success(m.tr_updated());
			await invalidateAll();
		} catch {
			// error toast handled by apiPatch
		} finally {
			editRunSaving = false;
		}
	}

	function openCloneRun() {
		cloneRunName = `Copy of ${run.name}`;
		cloneDialogOpen = true;
	}

	async function handleCloneRun() {
		cloneRunSaving = true;
		try {
			const { id } = await apiPost<{ id: number }>(`/api/projects/${projectId}/test-runs/${run.id}/clone`, { name: cloneRunName });
			cloneDialogOpen = false;
			toast.success(m.tr_cloned());
			goto(`${basePath}/${id}`);
		} catch {
			// error toast handled by apiPost
		} finally {
			cloneRunSaving = false;
		}
	}

	const hasFailures = $derived(stats.fail > 0 || stats.blocked > 0);

	function openRetestRun() {
		retestRunName = `Retest of ${run.name}`;
		retestDialogOpen = true;
	}

	async function handleRetestRun() {
		retestRunSaving = true;
		try {
			const { id } = await apiPost<{ id: number }>(`/api/projects/${projectId}/test-runs/${run.id}/retest`, { name: retestRunName });
			retestDialogOpen = false;
			toast.success(m.tr_retested());
			goto(`${basePath}/${id}`);
		} catch {
			// error toast handled by apiPost
		} finally {
			retestRunSaving = false;
		}
	}

	async function handleDeleteRun() {
		deleteRunSaving = true;
		try {
			await apiDelete(`/api/projects/${projectId}/test-runs/${run.id}`);
			deleteRunDialogOpen = false;
			toast.success(m.tr_deleted());
			goto(basePath);
		} catch {
			// error toast handled by apiDelete
		} finally {
			deleteRunSaving = false;
		}
	}

	function handleResult() {
		return async ({
			result,
			update
		}: {
			result: { type: string; data?: Record<string, unknown> };
			update: () => Promise<void>;
		}) => {
			if (result.type === 'success') {
				await invalidateAll();
				await tick();
			} else if (result.type === 'failure') {
				toast.error((result.data?.error as string) ?? m.error_operation_failed());
				await update();
			}
		};
	}
</script>

<!-- Header -->
<div class="flex items-center justify-between">
	<div>
		<a href={basePath} class="text-muted-foreground hover:text-foreground text-sm"
			>&larr; {m.common_back_to({ target: m.tr_title() })}</a
		>
		<div class="mt-1 flex items-center gap-3">
			<h2 class="text-xl font-bold">{run.name}</h2>
			{#if hasEnvDetails}
				<Popover.Root>
					<Popover.Trigger>
						<Badge variant="outline" class="cursor-pointer hover:bg-accent">
							{run.environment}
							<svg class="ml-1 inline h-3 w-3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
						</Badge>
					</Popover.Trigger>
					<Popover.Content class="w-80">
						<div class="space-y-2 text-sm">
							<p class="font-semibold">{run.environment} {m.env_details()}</p>
							{#if currentEnv?.baseUrl}
								<div>
									<span class="text-muted-foreground font-medium">{m.env_base_url()}</span>
									<p class="font-mono text-xs break-all">{currentEnv.baseUrl}</p>
								</div>
							{/if}
							{#if currentEnv?.credentials}
								<div>
									<span class="text-muted-foreground font-medium">{m.env_credentials()}</span>
									<p class="font-mono text-xs break-all">{currentEnv.credentials}</p>
								</div>
							{/if}
							{#if currentEnv?.memo}
								<div>
									<span class="text-muted-foreground font-medium">{m.env_memo()}</span>
									<p class="whitespace-pre-wrap text-xs">{currentEnv.memo}</p>
								</div>
							{/if}
						</div>
					</Popover.Content>
				</Popover.Root>
			{:else}
				<Badge variant="outline">{run.environment}</Badge>
			{/if}
			<Badge variant={statusVariant(run.status)}>{run.status.replace('_', ' ')}</Badge>
			{#if run.retestOfRunId}
				<a href="{basePath}/{run.retestOfRunId}" class="no-underline">
					<Badge variant="secondary" class="text-xs">{m.tr_retest_badge()}</Badge>
				</a>
			{/if}
			{#if sseConnected}
				<span class="flex items-center gap-1 text-xs text-green-600">
					<span class="inline-block h-2 w-2 animate-pulse rounded-full bg-green-500"></span>
					{m.sse_connected()}
				</span>
			{:else}
				<span class="flex items-center gap-1 text-xs text-orange-600">
					<span class="inline-block h-2 w-2 rounded-full bg-orange-500"></span>
					{m.sse_disconnected()}
				</span>
			{/if}
		</div>
	</div>
	<div class="flex gap-2">
		<Button
			variant="outline"
			size="sm"
			href="/api/projects/{projectId}/test-runs/{run.id}/export"
		>
			{m.run_export_csv()}
		</Button>
		{#if canExecute && run.status === 'CREATED'}
			<Button variant="outline" size="sm" onclick={openEditRun}>
				{m.tr_edit()}
			</Button>
		{/if}
		{#if canExecute}
			<Button variant="outline" size="sm" onclick={openCloneRun}>
				{m.tr_clone()}
			</Button>
			{#if hasFailures}
				<Button variant="outline" size="sm" onclick={openRetestRun}>
					{m.tr_retest()}
				</Button>
			{/if}
		{/if}
		{#if isAdmin}
			<Button
				variant="outline"
				size="sm"
				class="text-destructive hover:text-destructive"
				onclick={() => (deleteRunDialogOpen = true)}
			>
				{m.tr_delete()}
			</Button>
		{/if}
		{#if canExecute && run.status !== 'COMPLETED'}
			{#if run.status === 'CREATED'}
				<form method="POST" action="?/updateRunStatus" use:enhance={handleResult}>
					<input type="hidden" name="status" value="IN_PROGRESS" />
					<Button type="submit" size="sm">{m.run_start()}</Button>
				</form>
			{/if}
			{#if run.status === 'IN_PROGRESS'}
				<form method="POST" action="?/updateRunStatus" use:enhance={handleResult}>
					<input type="hidden" name="status" value="COMPLETED" />
					<Button type="submit" variant="outline" size="sm">{m.run_complete()}</Button>
				</form>
			{/if}
		{/if}
	</div>
</div>

<!-- Progress Stats -->
<Card.Root>
	<Card.Content class="pt-6">
		<div class="space-y-3">
			<div class="flex items-center justify-between text-sm">
				<span class="font-medium">{m.run_progress()}</span>
				<span class="text-muted-foreground">{m.run_pct_complete({ pct: completedPct })}</span>
			</div>
			<div class="bg-secondary flex h-3 overflow-hidden rounded-full">
				{#if stats.pass > 0}
					<div
						class="bg-green-500 transition-all"
						style="width: {(stats.pass / stats.total) * 100}%"
					></div>
				{/if}
				{#if stats.fail > 0}
					<div
						class="bg-red-500 transition-all"
						style="width: {(stats.fail / stats.total) * 100}%"
					></div>
				{/if}
				{#if stats.blocked > 0}
					<div
						class="bg-orange-500 transition-all"
						style="width: {(stats.blocked / stats.total) * 100}%"
					></div>
				{/if}
				{#if stats.skipped > 0}
					<div
						class="bg-gray-400 transition-all"
						style="width: {(stats.skipped / stats.total) * 100}%"
					></div>
				{/if}
			</div>
			<div class="flex flex-wrap gap-4 text-sm">
				<span class="flex items-center gap-1">
					<span class="inline-block h-3 w-3 rounded-full bg-green-500"></span>
					{m.dashboard_pass()}: {stats.pass}
				</span>
				<span class="flex items-center gap-1">
					<span class="inline-block h-3 w-3 rounded-full bg-red-500"></span>
					{m.dashboard_fail()}: {stats.fail}
				</span>
				<span class="flex items-center gap-1">
					<span class="inline-block h-3 w-3 rounded-full bg-orange-500"></span>
					{m.dashboard_blocked()}: {stats.blocked}
				</span>
				<span class="flex items-center gap-1">
					<span class="inline-block h-3 w-3 rounded-full bg-gray-400"></span>
					{m.dashboard_skipped()}: {stats.skipped}
				</span>
				<span class="flex items-center gap-1">
					<span class="bg-secondary inline-block h-3 w-3 rounded-full"></span>
					{m.dashboard_pending()}: {stats.pending}
				</span>
			</div>
		</div>
	</Card.Content>
</Card.Root>

<!-- Edit Run Dialog -->
<Dialog.Root bind:open={editRunDialogOpen}>
	<Dialog.Portal>
		<Dialog.Overlay />
		<Dialog.Content class="sm:max-w-md">
			<Dialog.Header>
				<Dialog.Title>{m.tr_edit_title()}</Dialog.Title>
			</Dialog.Header>
			<div class="space-y-4 py-4">
				<div class="space-y-2">
					<Label for="editRunName">{m.tr_run_name()}</Label>
					<Input id="editRunName" bind:value={editRunName} />
				</div>
				<div class="space-y-2">
					<Label for="editRunEnv">{m.common_environment()}</Label>
					<Select.Root
						type="single"
						value={editRunEnv}
						onValueChange={(v: string) => {
							editRunEnv = v;
						}}
					>
						<Select.Trigger class="w-full">
							{editRunEnv}
						</Select.Trigger>
						<Select.Content>
							{#each environments as env (env.id)}
								<Select.Item value={env.name} label={env.name} />
							{/each}
						</Select.Content>
					</Select.Root>
				</div>
			</div>
			<Dialog.Footer>
				<Button variant="outline" onclick={() => (editRunDialogOpen = false)}>
					{m.common_cancel()}
				</Button>
				<Button onclick={handleEditRun} disabled={editRunSaving || !editRunName.trim()}>
					{editRunSaving ? m.common_saving() : m.common_save_changes()}
				</Button>
			</Dialog.Footer>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<!-- Clone Run Dialog -->
<Dialog.Root bind:open={cloneDialogOpen}>
	<Dialog.Portal>
		<Dialog.Overlay />
		<Dialog.Content class="sm:max-w-md">
			<Dialog.Header>
				<Dialog.Title>{m.tr_clone_title()}</Dialog.Title>
			</Dialog.Header>
			<div class="space-y-4 py-4">
				<div class="space-y-2">
					<Label for="cloneRunName">{m.tr_clone_name_label()}</Label>
					<Input id="cloneRunName" bind:value={cloneRunName} />
				</div>
			</div>
			<Dialog.Footer>
				<Button variant="outline" onclick={() => (cloneDialogOpen = false)}>
					{m.common_cancel()}
				</Button>
				<Button onclick={handleCloneRun} disabled={cloneRunSaving || !cloneRunName.trim()}>
					{cloneRunSaving ? m.common_creating() : m.tr_clone()}
				</Button>
			</Dialog.Footer>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<!-- Retest Run Dialog -->
<Dialog.Root bind:open={retestDialogOpen}>
	<Dialog.Portal>
		<Dialog.Overlay />
		<Dialog.Content class="sm:max-w-md">
			<Dialog.Header>
				<Dialog.Title>{m.tr_retest_title()}</Dialog.Title>
			</Dialog.Header>
			<div class="space-y-4 py-4">
				<p class="text-muted-foreground text-sm">{m.tr_retest_desc()}</p>
				<p class="text-sm">
					FAIL: {stats.fail}, BLOCKED: {stats.blocked}
				</p>
				<div class="space-y-2">
					<Label for="retestRunName">{m.tr_retest_name_label()}</Label>
					<Input id="retestRunName" bind:value={retestRunName} />
				</div>
			</div>
			<Dialog.Footer>
				<Button variant="outline" onclick={() => (retestDialogOpen = false)}>
					{m.common_cancel()}
				</Button>
				<Button onclick={handleRetestRun} disabled={retestRunSaving || !retestRunName.trim()}>
					{retestRunSaving ? m.common_creating() : m.tr_retest()}
				</Button>
			</Dialog.Footer>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<!-- Delete Run Dialog -->
<AlertDialog.Root bind:open={deleteRunDialogOpen}>
	<AlertDialog.Portal>
		<AlertDialog.Overlay />
		<AlertDialog.Content>
			<AlertDialog.Header>
				<AlertDialog.Title>{m.tr_delete_title()}</AlertDialog.Title>
				<AlertDialog.Description>
					{m.tr_delete_confirm()}
				</AlertDialog.Description>
			</AlertDialog.Header>
			<AlertDialog.Footer>
				<AlertDialog.Cancel>{m.common_cancel()}</AlertDialog.Cancel>
				<Button variant="destructive" onclick={handleDeleteRun} disabled={deleteRunSaving}>
					{deleteRunSaving ? m.common_saving() : m.common_delete()}
				</Button>
			</AlertDialog.Footer>
		</AlertDialog.Content>
	</AlertDialog.Portal>
</AlertDialog.Root>
