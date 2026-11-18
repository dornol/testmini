<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import PriorityBadge from '$lib/components/PriorityBadge.svelte';
	import TestCasePicker from '$lib/components/patterns/TestCasePicker.svelte';
	import * as m from '$lib/paraglide/messages.js';
	import { apiPatch, apiDelete, apiPost, apiFetch } from '$lib/api-client';

	type ProjectEnvironment = { name: string; isDefault: boolean };
	type ProjectPriority = { name: string; color: string };

	let { data } = $props();

	const basePath = $derived(`/projects/${data.project.id}/test-plans`);
	const canManage = $derived(
		data.userRole === 'PROJECT_ADMIN' ||
			data.userRole === 'QA' ||
			data.userRole === 'DEV' ||
			data.userRole === 'ADMIN'
	);
	const canDelete = $derived(data.userRole === 'PROJECT_ADMIN' || data.userRole === 'ADMIN');

	const statuses = ['DRAFT', 'IN_REVIEW', 'APPROVED', 'ACTIVE', 'COMPLETED', 'ARCHIVED'] as const;

	function statusLabel(s: string) {
		const map: Record<string, () => string> = {
			DRAFT: m.tp_status_draft,
			IN_REVIEW: m.tp_status_in_review,
			APPROVED: m.tp_status_approved,
			ACTIVE: m.tp_status_active,
			COMPLETED: m.tp_status_completed,
			ARCHIVED: m.tp_status_archived
		};
		return map[s]?.() ?? s;
	}

	function statusVariant(s: string): 'default' | 'secondary' | 'outline' | 'destructive' {
		switch (s) {
			case 'DRAFT':
				return 'outline';
			case 'IN_REVIEW':
				return 'secondary';
			case 'APPROVED':
				return 'default';
			case 'ACTIVE':
				return 'default';
			case 'COMPLETED':
				return 'default';
			case 'ARCHIVED':
				return 'outline';
			default:
				return 'outline';
		}
	}

	// Delete plan dialog
	let deleteDialogOpen = $state(false);
	let deleteSaving = $state(false);

	// Add cases dialog
	let addCasesDialogOpen = $state(false);
	let addCasesSelected = $state<Set<number>>(new Set());
	let addCasesSaving = $state(false);

	// Create run dialog
	let createRunDialogOpen = $state(false);
	let runName = $state('');
	let runEnvironment = $state('');
	let creatingSaving = $state(false);

	const planItemTcIds = $derived(new Set(data.items.map((i) => i.testCaseId)));

	const availableCases = $derived(data.allTestCases.filter((tc) => !planItemTcIds.has(tc.id)));
	async function handleStatusChange(newStatus: string) {
		try {
			await apiPatch(`/api/projects/${data.project.id}/test-plans/${data.plan.id}`, {
				status: newStatus
			});
			toast.success(m.tp_updated());
			await invalidateAll();
		} catch {
			// error toast handled by apiPatch
		}
	}

	async function handleDelete() {
		deleteSaving = true;
		try {
			await apiDelete(`/api/projects/${data.project.id}/test-plans/${data.plan.id}`);
			toast.success(m.tp_deleted());
			goto(basePath);
		} catch {
			// error toast handled by apiDelete
		} finally {
			deleteSaving = false;
		}
	}

	function openAddCases() {
		addCasesSelected = new Set();
		addCasesDialogOpen = true;
	}

	async function handleAddCases() {
		if (addCasesSaving || addCasesSelected.size === 0 || addCasesSelected.size > 500) return;
		addCasesSaving = true;
		try {
			await apiPost(`/api/projects/${data.project.id}/test-plans/${data.plan.id}/items`, {
				testCaseIds: [...addCasesSelected]
			});
			addCasesDialogOpen = false;
			toast.success(m.tp_updated());
			await invalidateAll();
		} catch {
			// error toast handled by apiPost
		} finally {
			addCasesSaving = false;
		}
	}

	async function removeCase(testCaseId: number) {
		try {
			await apiFetch(`/api/projects/${data.project.id}/test-plans/${data.plan.id}/items`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ testCaseIds: [testCaseId] })
			});
			toast.success(m.tp_updated());
			await invalidateAll();
		} catch {
			// error toast handled by apiFetch
		}
	}

	function openCreateRun() {
		runName = '';
		const defaultEnv =
			(data.projectEnvironments as ProjectEnvironment[]).find((e) => e.isDefault)?.name ??
			(data.projectEnvironments as ProjectEnvironment[])[0]?.name ??
			'DEV';
		runEnvironment = defaultEnv;
		createRunDialogOpen = true;
	}

	async function handleCreateRun() {
		if (!runName.trim() || !runEnvironment.trim()) return;
		creatingSaving = true;
		try {
			const result = await apiPost<{ runId: number }>(
				`/api/projects/${data.project.id}/test-plans/${data.plan.id}/create-run`,
				{
					name: runName,
					environment: runEnvironment
				}
			);
			createRunDialogOpen = false;
			toast.success(m.tp_created());
			goto(`/projects/${data.project.id}/test-runs/${result.runId}`);
		} catch {
			// error toast handled by apiPost
		} finally {
			creatingSaving = false;
		}
	}

	function getPriorityColor(name: string): string {
		return (
			(data.projectPriorities as ProjectPriority[]).find((p) => p.name === name)?.color ?? '#6b7280'
		);
	}

	function formatDate(date: string | Date | null) {
		if (!date) return '-';
		return new Date(date).toLocaleDateString();
	}

	// Sign-off
	let signoffDialogOpen = $state(false);
	let signoffDecision = $state<'APPROVED' | 'REJECTED'>('APPROVED');
	let signoffComment = $state('');
	let signoffSaving = $state(false);
	const canSignoff = $derived(
		data.userRole === 'PROJECT_ADMIN' || data.userRole === 'QA' || data.userRole === 'ADMIN'
	);

	function openSignoff() {
		signoffDecision = 'APPROVED';
		signoffComment = '';
		signoffDialogOpen = true;
	}

	async function handleSignoff() {
		signoffSaving = true;
		try {
			await apiPost(`/api/projects/${data.project.id}/test-plans/${data.plan.id}/signoffs`, {
				decision: signoffDecision,
				comment: signoffComment.trim() || undefined
			});
			signoffDialogOpen = false;
			toast.success(m.signoff_submitted());
			await invalidateAll();
		} catch {
			/* handled */
		} finally {
			signoffSaving = false;
		}
	}

	// Release linking
	async function handleReleaseChange(releaseId: string) {
		try {
			await apiPatch(`/api/projects/${data.project.id}/test-plans/${data.plan.id}`, {
				releaseId: releaseId ? Number(releaseId) : null
			});
			toast.success(m.tp_updated());
			await invalidateAll();
		} catch {
			/* handled */
		}
	}
</script>

<div class="space-y-4">
	<!-- Header -->
	<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
		<div class="min-w-0">
			<a href={basePath} class="text-muted-foreground hover:text-foreground text-sm">
				&larr; {m.common_back_to({ target: m.tp_title() })}
			</a>
			<div class="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
				<h2 class="min-w-0 text-xl font-bold leading-tight break-words">{data.plan.name}</h2>
				<Select.Root
					type="single"
					value={data.plan.status}
					onValueChange={(v: string) => handleStatusChange(v)}
				>
					<Select.Trigger size="sm" class="w-full text-xs sm:w-36">
						<Badge variant={statusVariant(data.plan.status)}>{statusLabel(data.plan.status)}</Badge>
					</Select.Trigger>
					<Select.Content>
						{#each statuses as s}
							<Select.Item value={s} label={statusLabel(s)} />
						{/each}
					</Select.Content>
				</Select.Root>
			</div>
			{#if data.plan.milestone}
				<p class="text-muted-foreground mt-1 break-words text-sm">
					{m.tp_milestone()}: {data.plan.milestone}
				</p>
			{/if}
			{#if data.plan.startDate || data.plan.endDate}
				<p class="text-muted-foreground text-sm">
					{formatDate(data.plan.startDate)} ~ {formatDate(data.plan.endDate)}
				</p>
			{/if}
			{#if data.plan.description}
				<p class="text-muted-foreground mt-1 break-words text-sm">{data.plan.description}</p>
			{/if}
		</div>
		<div class="flex w-full shrink-0 gap-2 sm:w-auto">
			{#if canDelete}
				<Button
					variant="outline"
					size="sm"
					class="w-full text-destructive hover:text-destructive sm:w-auto"
					onclick={() => (deleteDialogOpen = true)}
				>
					{m.common_delete()}
				</Button>
			{/if}
		</div>
	</div>

	<!-- Release & Sign-off Row -->
	<div class="grid gap-4 sm:flex sm:flex-wrap sm:items-start">
		<!-- Release Link -->
		{#if data.releases.length > 0}
			<div class="min-w-0 space-y-1">
				<span class="text-xs font-medium text-muted-foreground">{m.nav_releases()}</span>
				<Select.Root
					type="single"
					value={data.plan.releaseId?.toString() ?? ''}
					onValueChange={(v: string) => handleReleaseChange(v)}
				>
					<Select.Trigger size="sm" class="w-full min-w-0 text-xs sm:w-64">
						{@const linked = data.releases.find((r) => r.id === data.plan.releaseId)}
						{@const linkedLabel = linked
							? `${linked.name}${linked.version ? ` (${linked.version})` : ''}`
							: '-'}
						<span class="min-w-0 flex-1 truncate text-left" title={linkedLabel}>{linkedLabel}</span>
					</Select.Trigger>
					<Select.Content>
						<Select.Item value="" label="-" />
						{#each data.releases as rel (rel.id)}
							<Select.Item
								value={rel.id.toString()}
								label={`${rel.name}${rel.version ? ` (${rel.version})` : ''}`}
							/>
						{/each}
					</Select.Content>
				</Select.Root>
			</div>
		{/if}

		<!-- Sign-off Status -->
		{#if data.requireSignoff}
			<div class="min-w-0 space-y-1">
				<span class="text-xs font-medium text-muted-foreground">{m.signoff_title()}</span>
				<div class="flex flex-wrap items-center gap-2">
					{#if data.signoffs.length > 0}
						{@const latest = data.signoffs[data.signoffs.length - 1]}
						<Badge variant={latest.decision === 'APPROVED' ? 'default' : 'destructive'}>
							{latest.decision === 'APPROVED'
								? m.signoff_decision_approved()
								: m.signoff_decision_rejected()}
						</Badge>
						<span class="text-xs text-muted-foreground">{latest.userName}</span>
					{:else}
						<Badge variant="outline">{m.signoff_required()}</Badge>
					{/if}
					{#if canSignoff}
						<Button
							variant="outline"
							size="sm"
							class="h-8 w-full text-xs sm:h-7 sm:w-auto"
							onclick={openSignoff}
						>
							{m.signoff_submit()}
						</Button>
					{/if}
				</div>
			</div>
		{/if}
	</div>

	<!-- Sign-off History -->
	{#if data.signoffs.length > 0}
		<div class="space-y-2">
			<h3 class="font-semibold text-sm">{m.signoff_history()}</h3>
			<div class="overflow-x-auto rounded-md border">
				<Table.Root class="min-w-[560px] table-fixed">
					<Table.Header>
						<Table.Row>
							<Table.Head class="w-28 py-1 px-2 text-xs">{m.common_date()}</Table.Head>
							<Table.Head class="w-24 py-1 px-2 text-xs">{m.signoff_title()}</Table.Head>
							<Table.Head class="w-28 py-1 px-2 text-xs">{m.common_name()}</Table.Head>
							<Table.Head class="py-1 px-2 text-xs">{m.signoff_comment()}</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each data.signoffs as s (s.id)}
							<Table.Row>
								<Table.Cell class="py-1 px-2 text-xs text-muted-foreground"
									>{formatDate(s.createdAt)}</Table.Cell
								>
								<Table.Cell class="py-1 px-2 text-xs">
									<Badge
										variant={s.decision === 'APPROVED' ? 'default' : 'destructive'}
										class="text-xs"
									>
										{s.decision === 'APPROVED'
											? m.signoff_decision_approved()
											: m.signoff_decision_rejected()}
									</Badge>
								</Table.Cell>
								<Table.Cell class="min-w-0 py-1 px-2 text-xs">
									<div class="truncate" title={s.userName}>{s.userName}</div>
								</Table.Cell>
								<Table.Cell class="min-w-0 py-1 px-2 text-xs text-muted-foreground">
									<div class="truncate" title={s.comment ?? '-'}>
										{s.comment ?? '-'}
									</div>
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</div>
		</div>
	{/if}

	<!-- Test Cases Section -->
	<div class="space-y-2">
		<div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
			<h3 class="font-semibold">{m.tp_select_cases()} ({data.items.length})</h3>
			<div class="flex flex-col gap-2 sm:flex-row">
				{#if canManage}
					<Button variant="outline" size="sm" class="w-full sm:w-auto" onclick={openAddCases}>
						{m.tp_add_cases()}
					</Button>
				{/if}
			</div>
		</div>

		{#if data.items.length === 0}
			<div
				class="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center"
			>
				<p class="text-muted-foreground text-sm">{m.tp_no_cases()}</p>
				{#if canManage}
					<Button class="mt-4 w-full sm:w-auto" onclick={openAddCases}>{m.tp_add_cases()}</Button>
				{/if}
			</div>
		{:else}
			<div class="space-y-2 md:hidden">
				{#each data.items as item (item.id)}
					<Card.Root class="gap-2 rounded-lg py-3">
						<Card.Content class="space-y-2">
							<div class="flex items-start justify-between gap-3">
								<div class="min-w-0">
									<p class="font-mono text-xs text-muted-foreground">{item.key}</p>
									<p class="break-words font-medium leading-snug">{item.title}</p>
								</div>
								<span class="max-w-[40%] shrink-0">
									<PriorityBadge name={item.priority} color={getPriorityColor(item.priority)} />
								</span>
							</div>
							{#if canManage}
								<div class="flex justify-end">
									<Button
										variant="ghost"
										size="sm"
										class="h-8 w-full px-2 text-xs text-destructive hover:text-destructive sm:h-7 sm:w-auto"
										onclick={() => removeCase(item.testCaseId)}
									>
										{m.tp_remove_case()}
									</Button>
								</div>
							{/if}
						</Card.Content>
					</Card.Root>
				{/each}
			</div>
			<Card.Root class="hidden overflow-x-auto md:flex">
				<Table.Root class="min-w-[560px] table-fixed">
					<Table.Header>
						<Table.Row>
							<Table.Head class="w-28">{m.common_key()}</Table.Head>
							<Table.Head>{m.common_title()}</Table.Head>
							<Table.Head class="w-28">{m.common_priority()}</Table.Head>
							{#if canManage}
								<Table.Head class="w-24">{m.common_actions()}</Table.Head>
							{/if}
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each data.items as item (item.id)}
							<Table.Row>
								<Table.Cell class="font-mono text-sm">{item.key}</Table.Cell>
								<Table.Cell class="min-w-0 font-medium">
									<div class="truncate" title={item.title}>{item.title}</div>
								</Table.Cell>
								<Table.Cell>
									<PriorityBadge name={item.priority} color={getPriorityColor(item.priority)} />
								</Table.Cell>
								{#if canManage}
									<Table.Cell>
										<Button
											variant="ghost"
											size="sm"
											class="text-destructive hover:text-destructive h-7 px-2 text-xs"
											onclick={() => removeCase(item.testCaseId)}
										>
											{m.tp_remove_case()}
										</Button>
									</Table.Cell>
								{/if}
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</Card.Root>
		{/if}
	</div>

	<!-- Linked Runs Section -->
	<div class="space-y-2">
		<div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
			<h3 class="font-semibold">{m.tp_linked_runs()}</h3>
			{#if canManage && data.items.length > 0}
				<Button size="sm" class="w-full sm:w-auto" onclick={openCreateRun}
					>{m.tp_create_run()}</Button
				>
			{/if}
		</div>

		{#if data.runs.length === 0}
			<div
				class="flex flex-col items-center justify-center rounded-lg border border-dashed p-6 text-center"
			>
				<p class="text-muted-foreground text-sm">{m.tp_no_runs()}</p>
			</div>
		{:else}
			<div class="space-y-2 md:hidden">
				{#each data.runs as run (run.id)}
					<button
						type="button"
						class="block w-full rounded-lg border bg-card p-4 text-left text-card-foreground shadow-sm transition-colors hover:bg-muted/50"
						onclick={() => goto(`/projects/${data.project.id}/test-runs/${run.id}`)}
					>
						<div class="flex items-start justify-between gap-3">
							<div class="min-w-0">
								<p class="break-words font-medium leading-snug">{run.name}</p>
								<p class="mt-1 break-words text-sm text-muted-foreground">
									{run.environment} · {formatDate(run.createdAt)}
								</p>
							</div>
							<Badge variant={run.status === 'COMPLETED' ? 'default' : 'secondary'}
								>{run.status}</Badge
							>
						</div>
					</button>
				{/each}
			</div>
			<Card.Root class="hidden overflow-x-auto md:flex">
				<Table.Root class="min-w-[560px] table-fixed">
					<Table.Header>
						<Table.Row>
							<Table.Head>{m.common_name()}</Table.Head>
							<Table.Head class="w-28">{m.common_status()}</Table.Head>
							<Table.Head class="w-28">{m.common_environment()}</Table.Head>
							<Table.Head class="w-28">{m.tr_created_at()}</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each data.runs as run (run.id)}
							<Table.Row
								class="cursor-pointer hover:bg-muted/50"
								onclick={() => goto(`/projects/${data.project.id}/test-runs/${run.id}`)}
							>
								<Table.Cell class="min-w-0 font-medium">
									<div class="truncate" title={run.name}>{run.name}</div>
								</Table.Cell>
								<Table.Cell>
									<Badge variant={run.status === 'COMPLETED' ? 'default' : 'secondary'}
										>{run.status}</Badge
									>
								</Table.Cell>
								<Table.Cell class="min-w-0 text-sm text-muted-foreground">
									<div class="truncate" title={run.environment}>{run.environment}</div>
								</Table.Cell>
								<Table.Cell class="text-muted-foreground text-sm"
									>{formatDate(run.createdAt)}</Table.Cell
								>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</Card.Root>
		{/if}
	</div>
</div>

<!-- Delete Plan Dialog -->
<AlertDialog.Root bind:open={deleteDialogOpen}>
	<AlertDialog.Portal>
		<AlertDialog.Overlay />
		<AlertDialog.Content>
			<AlertDialog.Header>
				<AlertDialog.Title>{m.tp_delete_title()}</AlertDialog.Title>
				<AlertDialog.Description>{m.tp_delete_confirm()}</AlertDialog.Description>
			</AlertDialog.Header>
			<AlertDialog.Footer>
				<AlertDialog.Cancel class="w-full sm:w-auto">{m.common_cancel()}</AlertDialog.Cancel>
				<Button
					variant="destructive"
					class="w-full sm:w-auto"
					onclick={handleDelete}
					disabled={deleteSaving}
				>
					{deleteSaving ? m.common_saving() : m.common_delete()}
				</Button>
			</AlertDialog.Footer>
		</AlertDialog.Content>
	</AlertDialog.Portal>
</AlertDialog.Root>

<!-- Add Cases Dialog -->
<Dialog.Root bind:open={addCasesDialogOpen}>
	<Dialog.Portal>
		<Dialog.Overlay />
		<Dialog.Content class="flex max-h-[calc(100dvh-2rem)] flex-col sm:max-w-2xl">
			<Dialog.Header>
				<Dialog.Title>{m.tp_add_cases()}</Dialog.Title>
			</Dialog.Header>
			<div class="min-h-0 overflow-y-auto py-2">
				{#if addCasesDialogOpen}
					<TestCasePicker
						id="plan-add-cases"
						cases={availableCases}
						bind:selected={addCasesSelected}
						priorities={data.projectPriorities}
						disabled={addCasesSaving}
					/>
				{/if}
			</div>
			<Dialog.Footer>
				<Button
					variant="outline"
					class="w-full sm:w-auto"
					onclick={() => (addCasesDialogOpen = false)}>{m.common_cancel()}</Button
				>
				<Button
					class="w-full sm:w-auto"
					onclick={handleAddCases}
					disabled={addCasesSaving || addCasesSelected.size === 0 || addCasesSelected.size > 500}
				>
					{addCasesSaving ? m.common_saving() : m.tp_add_cases()} ({addCasesSelected.size})
				</Button>
			</Dialog.Footer>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<!-- Sign-off Dialog -->
<Dialog.Root bind:open={signoffDialogOpen}>
	<Dialog.Portal>
		<Dialog.Overlay />
		<Dialog.Content class="sm:max-w-md">
			<Dialog.Header>
				<Dialog.Title>{m.signoff_submit()}</Dialog.Title>
			</Dialog.Header>
			<div class="space-y-4 py-4">
				<div class="flex flex-col gap-2 sm:flex-row">
					<Button
						variant={signoffDecision === 'APPROVED' ? 'default' : 'outline'}
						size="sm"
						class="w-full sm:w-auto"
						onclick={() => {
							signoffDecision = 'APPROVED';
						}}
					>
						{m.signoff_approve()}
					</Button>
					<Button
						variant={signoffDecision === 'REJECTED' ? 'destructive' : 'outline'}
						size="sm"
						class="w-full sm:w-auto"
						onclick={() => {
							signoffDecision = 'REJECTED';
						}}
					>
						{m.signoff_reject()}
					</Button>
				</div>
				<div class="space-y-2">
					<Label for="signoffComment">{m.signoff_comment()}</Label>
					<Textarea
						id="signoffComment"
						bind:value={signoffComment}
						placeholder={m.signoff_comment_placeholder()}
						rows={3}
					/>
				</div>
			</div>
			<Dialog.Footer>
				<Button
					variant="outline"
					class="w-full sm:w-auto"
					onclick={() => (signoffDialogOpen = false)}>{m.common_cancel()}</Button
				>
				<Button class="w-full sm:w-auto" onclick={handleSignoff} disabled={signoffSaving}>
					{signoffSaving ? m.common_saving() : m.signoff_submit()}
				</Button>
			</Dialog.Footer>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<!-- Create Run Dialog -->
<Dialog.Root bind:open={createRunDialogOpen}>
	<Dialog.Portal>
		<Dialog.Overlay />
		<Dialog.Content class="sm:max-w-md">
			<Dialog.Header>
				<Dialog.Title>{m.tp_create_run()}</Dialog.Title>
			</Dialog.Header>
			<div class="space-y-4 py-4">
				<div class="space-y-2">
					<Label for="runName">{m.tr_run_name()}</Label>
					<Input id="runName" bind:value={runName} placeholder={m.tr_run_name_placeholder()} />
				</div>
				<div class="space-y-2">
					<Label for="runEnv">{m.common_environment()}</Label>
					<Select.Root
						type="single"
						value={runEnvironment}
						onValueChange={(v: string) => {
							runEnvironment = v;
						}}
					>
						<Select.Trigger class="w-full">
							{runEnvironment}
						</Select.Trigger>
						<Select.Content>
							{#each data.projectEnvironments as env (env.id)}
								<Select.Item value={env.name} label={env.name} />
							{/each}
						</Select.Content>
					</Select.Root>
				</div>
			</div>
			<Dialog.Footer>
				<Button
					variant="outline"
					class="w-full sm:w-auto"
					onclick={() => (createRunDialogOpen = false)}>{m.common_cancel()}</Button
				>
				<Button
					class="w-full sm:w-auto"
					onclick={handleCreateRun}
					disabled={creatingSaving || !runName.trim()}
				>
					{creatingSaving ? m.common_creating() : m.tp_create_run()}
				</Button>
			</Dialog.Footer>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
