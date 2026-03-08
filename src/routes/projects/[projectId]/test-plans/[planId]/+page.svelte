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
	import PriorityBadge from '$lib/components/PriorityBadge.svelte';
	import VirtualList from '$lib/components/VirtualList.svelte';
	import * as m from '$lib/paraglide/messages.js';
	import { apiPatch, apiDelete, apiPost, apiFetch } from '$lib/api-client';

	let { data } = $props();

	const basePath = $derived(`/projects/${data.project.id}/test-plans`);
	const canManage = $derived(
		data.userRole === 'PROJECT_ADMIN' || data.userRole === 'QA' || data.userRole === 'DEV' || data.userRole === 'ADMIN'
	);
	const canDelete = $derived(
		data.userRole === 'PROJECT_ADMIN' || data.userRole === 'ADMIN'
	);

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
			case 'DRAFT': return 'outline';
			case 'IN_REVIEW': return 'secondary';
			case 'APPROVED': return 'default';
			case 'ACTIVE': return 'default';
			case 'COMPLETED': return 'default';
			case 'ARCHIVED': return 'outline';
			default: return 'outline';
		}
	}

	// Delete plan dialog
	let deleteDialogOpen = $state(false);
	let deleteSaving = $state(false);

	// Add cases dialog
	let addCasesDialogOpen = $state(false);
	let addCasesSearch = $state('');
	let addCasesSelected = $state<Set<number>>(new Set());
	let addCasesSaving = $state(false);

	// Create run dialog
	let createRunDialogOpen = $state(false);
	let runName = $state('');
	let runEnvironment = $state('');
	let creatingSaving = $state(false);

	const planItemTcIds = $derived(new Set(data.items.map((i) => i.testCaseId)));

	const availableCases = $derived(
		data.allTestCases.filter((tc) => {
			if (planItemTcIds.has(tc.id)) return false;
			if (!addCasesSearch) return true;
			const q = addCasesSearch.toLowerCase();
			return tc.title.toLowerCase().includes(q) || tc.key.toLowerCase().includes(q);
		})
	);

	async function handleStatusChange(newStatus: string) {
		try {
			await apiPatch(`/api/projects/${data.project.id}/test-plans/${data.plan.id}`, { status: newStatus });
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
		addCasesSearch = '';
		addCasesSelected = new Set();
		addCasesDialogOpen = true;
	}

	function toggleAddCase(id: number) {
		const newSet = new Set(addCasesSelected);
		if (newSet.has(id)) {
			newSet.delete(id);
		} else {
			newSet.add(id);
		}
		addCasesSelected = newSet;
	}

	async function handleAddCases() {
		if (addCasesSelected.size === 0) return;
		addCasesSaving = true;
		try {
			await apiPost(`/api/projects/${data.project.id}/test-plans/${data.plan.id}/items`, { testCaseIds: [...addCasesSelected] });
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
		const defaultEnv = data.projectEnvironments.find((e) => e.isDefault)?.name ?? data.projectEnvironments[0]?.name ?? 'DEV';
		runEnvironment = defaultEnv;
		createRunDialogOpen = true;
	}

	async function handleCreateRun() {
		if (!runName.trim() || !runEnvironment.trim()) return;
		creatingSaving = true;
		try {
			const result = await apiPost<{ runId: number }>(`/api/projects/${data.project.id}/test-plans/${data.plan.id}/create-run`, {
				name: runName,
				environment: runEnvironment
			});
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
		return data.projectPriorities.find((p) => p.name === name)?.color ?? '#6b7280';
	}

	function formatDate(date: string | Date | null) {
		if (!date) return '-';
		return new Date(date).toLocaleDateString();
	}
</script>

<div class="space-y-4">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<div>
			<a href={basePath} class="text-muted-foreground hover:text-foreground text-sm">
				&larr; {m.common_back_to({ target: m.tp_title() })}
			</a>
			<div class="mt-1 flex items-center gap-3">
				<h2 class="text-xl font-bold">{data.plan.name}</h2>
				<Select.Root
					type="single"
					value={data.plan.status}
					onValueChange={(v: string) => handleStatusChange(v)}
				>
					<Select.Trigger class="w-36 h-7 text-xs">
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
				<p class="text-muted-foreground mt-1 text-sm">{m.tp_milestone()}: {data.plan.milestone}</p>
			{/if}
			{#if data.plan.startDate || data.plan.endDate}
				<p class="text-muted-foreground text-sm">
					{formatDate(data.plan.startDate)} ~ {formatDate(data.plan.endDate)}
				</p>
			{/if}
			{#if data.plan.description}
				<p class="text-muted-foreground mt-1 text-sm">{data.plan.description}</p>
			{/if}
		</div>
		<div class="flex gap-2">
			{#if canDelete}
				<Button variant="outline" size="sm" class="text-destructive hover:text-destructive" onclick={() => (deleteDialogOpen = true)}>
					{m.common_delete()}
				</Button>
			{/if}
		</div>
	</div>

	<!-- Test Cases Section -->
	<div class="space-y-2">
		<div class="flex items-center justify-between">
			<h3 class="font-semibold">{m.tp_select_cases()} ({data.items.length})</h3>
			<div class="flex gap-2">
				{#if canManage}
					<Button variant="outline" size="sm" onclick={openAddCases}>
						{m.tp_add_cases()}
					</Button>
				{/if}
			</div>
		</div>

		{#if data.items.length === 0}
			<div class="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
				<p class="text-muted-foreground text-sm">{m.tp_no_cases()}</p>
				{#if canManage}
					<Button class="mt-4" onclick={openAddCases}>{m.tp_add_cases()}</Button>
				{/if}
			</div>
		{:else}
			<Card.Root>
				<Table.Root>
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
								<Table.Cell class="font-medium">{item.title}</Table.Cell>
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
		<div class="flex items-center justify-between">
			<h3 class="font-semibold">{m.tp_linked_runs()}</h3>
			{#if canManage && data.items.length > 0}
				<Button size="sm" onclick={openCreateRun}>{m.tp_create_run()}</Button>
			{/if}
		</div>

		{#if data.runs.length === 0}
			<div class="flex flex-col items-center justify-center rounded-lg border border-dashed p-6 text-center">
				<p class="text-muted-foreground text-sm">{m.tp_no_runs()}</p>
			</div>
		{:else}
			<Card.Root>
				<Table.Root>
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
								<Table.Cell class="font-medium">{run.name}</Table.Cell>
								<Table.Cell>
									<Badge variant={run.status === 'COMPLETED' ? 'default' : 'secondary'}>{run.status}</Badge>
								</Table.Cell>
								<Table.Cell class="text-muted-foreground text-sm">{run.environment}</Table.Cell>
								<Table.Cell class="text-muted-foreground text-sm">{formatDate(run.createdAt)}</Table.Cell>
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
				<AlertDialog.Cancel>{m.common_cancel()}</AlertDialog.Cancel>
				<Button variant="destructive" onclick={handleDelete} disabled={deleteSaving}>
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
		<Dialog.Content class="sm:max-w-2xl max-h-[80vh] flex flex-col">
			<Dialog.Header>
				<Dialog.Title>{m.tp_add_cases()}</Dialog.Title>
			</Dialog.Header>
			<div class="py-4 space-y-3 flex-1 overflow-hidden flex flex-col">
				<Input
					placeholder={m.tr_filter_placeholder()}
					bind:value={addCasesSearch}
				/>
				<div class="flex-1 border rounded-md">
					<Table.Root>
						<Table.Header>
							<Table.Row>
								<Table.Head class="w-10"></Table.Head>
								<Table.Head class="w-28">{m.common_key()}</Table.Head>
								<Table.Head>{m.common_title()}</Table.Head>
								<Table.Head class="w-28">{m.common_priority()}</Table.Head>
							</Table.Row>
						</Table.Header>
					</Table.Root>
					<VirtualList items={availableCases} rowHeight={44} height="360px">
						{#snippet children({ item })}
							{@const tc = item as typeof availableCases[0]}
							<Table.Root>
								<Table.Body>
									<Table.Row class="cursor-pointer" onclick={() => toggleAddCase(tc.id)}>
										<Table.Cell class="w-10">
											<input
												type="checkbox"
												checked={addCasesSelected.has(tc.id)}
												onchange={() => toggleAddCase(tc.id)}
												onclick={(e: MouseEvent) => e.stopPropagation()}
												class="rounded"
											/>
										</Table.Cell>
										<Table.Cell class="w-28 font-mono text-sm">{tc.key}</Table.Cell>
										<Table.Cell class="font-medium">{tc.title}</Table.Cell>
										<Table.Cell class="w-28">
											<PriorityBadge name={tc.priority} color={getPriorityColor(tc.priority)} />
										</Table.Cell>
									</Table.Row>
								</Table.Body>
							</Table.Root>
						{/snippet}
					</VirtualList>
				</div>
			</div>
			<Dialog.Footer>
				<Button variant="outline" onclick={() => (addCasesDialogOpen = false)}>{m.common_cancel()}</Button>
				<Button onclick={handleAddCases} disabled={addCasesSaving || addCasesSelected.size === 0}>
					{addCasesSaving ? m.common_saving() : m.tp_add_cases()} ({addCasesSelected.size})
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
						onValueChange={(v: string) => { runEnvironment = v; }}
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
				<Button variant="outline" onclick={() => (createRunDialogOpen = false)}>{m.common_cancel()}</Button>
				<Button onclick={handleCreateRun} disabled={creatingSaving || !runName.trim()}>
					{creatingSaving ? m.common_creating() : m.tp_create_run()}
				</Button>
			</Dialog.Footer>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
