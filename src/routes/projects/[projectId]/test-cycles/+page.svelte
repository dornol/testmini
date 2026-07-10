<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import * as m from '$lib/paraglide/messages.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { apiDelete, apiPost, apiPut } from '$lib/api-client';
	import { toast } from 'svelte-sonner';

	let { data } = $props();
	const canManage = $derived(data.userRole === 'PROJECT_ADMIN' || data.userRole === 'ADMIN' || data.userRole === 'QA');
	const canDelete = $derived(data.userRole === 'PROJECT_ADMIN' || data.userRole === 'ADMIN');
	const basePath = $derived(`/api/projects/${data.project.id}/test-cycles`);

	let statusFilter = $state('');
	let createOpen = $state(false);
	let createSaving = $state(false);
	let createName = $state('');
	let createNumber = $state(1);
	let createReleaseId = $state('');
	let createStartDate = $state('');
	let createEndDate = $state('');
	let deleteTarget = $state<(typeof data.cycles)[number] | null>(null);
	let deleteSaving = $state(false);

	const visibleCycles = $derived(
		statusFilter ? data.cycles.filter((cycle) => cycle.status === statusFilter) : data.cycles
	);

	function statusLabel(status: string): string {
		if (status === 'IN_PROGRESS') return m.cycle_in_progress();
		if (status === 'COMPLETED') return m.cycle_completed();
		return m.cycle_planned();
	}

	function statusVariant(status: string): 'default' | 'secondary' | 'outline' {
		if (status === 'COMPLETED') return 'default';
		if (status === 'IN_PROGRESS') return 'secondary';
		return 'outline';
	}

	function formatDate(value: Date | string | null): string {
		return value ? new Date(value).toLocaleDateString() : '-';
	}

	function openCreate() {
		createName = '';
		createNumber = data.nextCycleNumber;
		createReleaseId = '';
		createStartDate = '';
		createEndDate = '';
		createOpen = true;
	}

	async function createCycle() {
		if (!createName.trim() || createNumber < 1) return;
		createSaving = true;
		try {
			await apiPost(basePath, {
				name: createName.trim(),
				cycleNumber: createNumber,
				releaseId: createReleaseId ? Number(createReleaseId) : undefined,
				startDate: createStartDate || undefined,
				endDate: createEndDate || undefined
			});
			toast.success(m.cycle_created());
			createOpen = false;
			await invalidateAll();
		} catch {
			// error toast handled by apiPost
		} finally {
			createSaving = false;
		}
	}

	async function updateStatus(id: number, status: string) {
		try {
			await apiPut(`${basePath}/${id}`, { status });
			toast.success(m.cycle_updated());
			await invalidateAll();
		} catch {
			// error toast handled by apiPut
		}
	}

	async function deleteCycle() {
		if (!deleteTarget) return;
		deleteSaving = true;
		try {
			await apiDelete(`${basePath}/${deleteTarget.id}`);
			toast.success(m.cycle_deleted());
			deleteTarget = null;
			await invalidateAll();
		} catch {
			// error toast handled by apiDelete
		} finally {
			deleteSaving = false;
		}
	}
</script>

<div class="space-y-4">
	<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h2 class="text-lg font-semibold">{m.cycle_title()}</h2>
			<p class="text-sm text-muted-foreground">{m.cycle_empty_create()}</p>
		</div>
		{#if canManage}
			<Button size="sm" class="w-full sm:w-auto" onclick={openCreate}>{m.cycle_create()}</Button>
		{/if}
	</div>

	<div class="grid grid-cols-2 gap-1 min-[420px]:flex min-[420px]:flex-wrap">
		{#each ['', 'PLANNED', 'IN_PROGRESS', 'COMPLETED'] as status (status)}
			<Button
				size="sm"
				variant={statusFilter === status ? 'default' : 'outline'}
				class="h-8 w-full text-xs min-[420px]:w-auto"
				onclick={() => (statusFilter = status)}
			>
				{status ? statusLabel(status) : m.common_all()}
			</Button>
		{/each}
	</div>

	{#if visibleCycles.length === 0}
		<div class="rounded-md border border-dashed p-8 text-center">
			<h3 class="font-semibold">{m.cycle_empty_title()}</h3>
			<p class="mt-1 text-sm text-muted-foreground">{m.cycle_empty_create()}</p>
		</div>
	{:else}
		<div class="grid gap-3 lg:grid-cols-2">
			{#each visibleCycles as cycle (cycle.id)}
				<Card.Root>
					<Card.Header class="gap-2 pb-3">
						<div class="flex min-w-0 items-start justify-between gap-3">
							<div class="min-w-0">
								<Card.Title class="break-words text-base">#{cycle.cycleNumber} {cycle.name}</Card.Title>
								<Card.Description class="mt-1 break-words">
									{cycle.releaseName
										? `${cycle.releaseName}${cycle.releaseVersion ? ` (${cycle.releaseVersion})` : ''}`
										: '-'}
								</Card.Description>
							</div>
							<Badge variant={statusVariant(cycle.status)}>{statusLabel(cycle.status)}</Badge>
						</div>
					</Card.Header>
					<Card.Content class="space-y-3 pb-4">
						<div class="grid grid-cols-3 gap-3 text-sm">
							<div><div class="text-xs text-muted-foreground">{m.cycle_start_date()}</div>{formatDate(cycle.startDate)}</div>
							<div><div class="text-xs text-muted-foreground">{m.cycle_end_date()}</div>{formatDate(cycle.endDate)}</div>
							<div><div class="text-xs text-muted-foreground">{m.cycle_runs()}</div>{cycle.runCount}</div>
						</div>
						{#if canManage}
							<div class="flex flex-col gap-2 border-t pt-3 sm:flex-row">
								<Select.Root type="single" value={cycle.status} onValueChange={(value: string) => updateStatus(cycle.id, value)}>
									<Select.Trigger size="sm" class="w-full text-xs sm:w-40">{statusLabel(cycle.status)}</Select.Trigger>
									<Select.Content>
										<Select.Item value="PLANNED" label={m.cycle_planned()} />
										<Select.Item value="IN_PROGRESS" label={m.cycle_in_progress()} />
										<Select.Item value="COMPLETED" label={m.cycle_completed()} />
									</Select.Content>
								</Select.Root>
								{#if canDelete}
									<Button variant="ghost" size="sm" class="text-destructive hover:text-destructive sm:ml-auto" onclick={() => (deleteTarget = cycle)}>{m.common_delete()}</Button>
								{/if}
							</div>
						{/if}
					</Card.Content>
				</Card.Root>
			{/each}
		</div>
	{/if}
</div>

<Dialog.Root bind:open={createOpen}>
	<Dialog.Portal>
		<Dialog.Overlay />
		<Dialog.Content class="sm:max-w-lg">
			<Dialog.Header><Dialog.Title>{m.cycle_create()}</Dialog.Title></Dialog.Header>
			<div class="grid gap-4 py-2 sm:grid-cols-2">
				<div class="space-y-2 sm:col-span-2"><Label for="cycle-name">{m.cycle_name()}</Label><Input id="cycle-name" bind:value={createName} /></div>
				<div class="space-y-2"><Label for="cycle-number">{m.cycle_number()}</Label><Input id="cycle-number" type="number" min="1" bind:value={createNumber} /></div>
				<div class="space-y-2">
					<Label>{m.nav_releases()}</Label>
					<Select.Root type="single" value={createReleaseId} onValueChange={(value: string) => (createReleaseId = value)}>
						<Select.Trigger class="w-full"><span class="truncate">{createReleaseId ? data.releases.find((item) => String(item.id) === createReleaseId)?.name : '-'}</span></Select.Trigger>
						<Select.Content><Select.Item value="" label="-" />{#each data.releases as item (item.id)}<Select.Item value={String(item.id)} label={`${item.name}${item.version ? ` (${item.version})` : ''}`} />{/each}</Select.Content>
					</Select.Root>
				</div>
				<div class="space-y-2"><Label for="cycle-start">{m.cycle_start_date()}</Label><Input id="cycle-start" type="date" bind:value={createStartDate} /></div>
				<div class="space-y-2"><Label for="cycle-end">{m.cycle_end_date()}</Label><Input id="cycle-end" type="date" min={createStartDate || undefined} bind:value={createEndDate} /></div>
			</div>
			<Dialog.Footer>
				<Button variant="outline" class="w-full sm:w-auto" onclick={() => (createOpen = false)}>{m.common_cancel()}</Button>
				<Button class="w-full sm:w-auto" disabled={createSaving || !createName.trim() || createNumber < 1 || (!!createStartDate && !!createEndDate && createEndDate < createStartDate)} onclick={createCycle}>{createSaving ? m.common_creating() : m.cycle_create()}</Button>
			</Dialog.Footer>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<AlertDialog.Root open={!!deleteTarget} onOpenChange={(open) => !open && (deleteTarget = null)}>
	<AlertDialog.Portal>
		<AlertDialog.Overlay />
		<AlertDialog.Content>
			<AlertDialog.Header><AlertDialog.Title>{m.cycle_delete_title()}</AlertDialog.Title><AlertDialog.Description>{m.cycle_delete_confirm()}</AlertDialog.Description></AlertDialog.Header>
			<AlertDialog.Footer><AlertDialog.Cancel>{m.common_cancel()}</AlertDialog.Cancel><Button variant="destructive" disabled={deleteSaving} onclick={deleteCycle}>{deleteSaving ? m.common_saving() : m.common_delete()}</Button></AlertDialog.Footer>
		</AlertDialog.Content>
	</AlertDialog.Portal>
</AlertDialog.Root>
