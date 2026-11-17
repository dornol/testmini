<script lang="ts">
	import PageHeader from '$lib/components/patterns/PageHeader.svelte';
	import StatusFilter from '$lib/components/patterns/StatusFilter.svelte';
	import EmptyState from '$lib/components/patterns/EmptyState.svelte';
	import { page } from '$app/state';
	import { goto, invalidateAll } from '$app/navigation';
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
	const canManage = $derived(
		data.userRole === 'PROJECT_ADMIN' || data.userRole === 'ADMIN' || data.userRole === 'QA'
	);
	const canDelete = $derived(data.userRole === 'PROJECT_ADMIN' || data.userRole === 'ADMIN');
	const basePath = $derived(`/api/projects/${data.project.id}/test-cycles`);

	const statusFilter = $derived(page.url.searchParams.get('status') ?? '');
	function setStatusFilter(status: string) {
		const params = new URLSearchParams(page.url.searchParams);
		if (status) params.set('status', status);
		else params.delete('status');
		goto(`${page.url.pathname}${params.size ? `?${params}` : ''}`, {
			keepFocus: true,
			noScroll: true
		});
	}
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

<div class="space-y-6">
	<PageHeader title={m.cycle_title()}>
		{#snippet actions()}{#if canManage}<Button class="w-full sm:w-auto" onclick={openCreate}
					>{m.cycle_create()}</Button
				>{/if}{/snippet}
	</PageHeader>

	<StatusFilter
		value={statusFilter}
		onchange={setStatusFilter}
		options={['', 'PLANNED', 'IN_PROGRESS', 'COMPLETED'].map((value) => ({
			value,
			label: value ? statusLabel(value) : m.common_all()
		}))}
	/>

	{#if visibleCycles.length === 0}
		<EmptyState
			title={statusFilter ? m.ui_no_filtered_results() : m.cycle_empty_title()}
			description={statusFilter ? m.ui_no_filtered_description() : m.cycle_empty_create()}
		>
			{#snippet actions()}
				{#if statusFilter}<Button variant="outline" onclick={() => setStatusFilter('')}
						>{m.ui_clear_filters()}</Button
					>
				{:else if canManage}<Button class="w-full sm:w-auto" onclick={openCreate}
						>{m.cycle_create()}</Button
					>{/if}
			{/snippet}
		</EmptyState>
	{:else}
		<div class="grid gap-3 lg:grid-cols-2">
			{#each visibleCycles as cycle (cycle.id)}
				<Card.Root>
					<Card.Header class="gap-2 pb-3">
						<div class="flex min-w-0 items-start justify-between gap-3">
							<div class="min-w-0">
								<Card.Title class="break-words text-base"
									>#{cycle.cycleNumber} {cycle.name}</Card.Title
								>
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
							<div>
								<div class="text-xs text-muted-foreground">{m.cycle_start_date()}</div>
								{formatDate(cycle.startDate)}
							</div>
							<div>
								<div class="text-xs text-muted-foreground">{m.cycle_end_date()}</div>
								{formatDate(cycle.endDate)}
							</div>
							<div>
								<div class="text-xs text-muted-foreground">{m.cycle_runs()}</div>
								{cycle.runCount}
							</div>
						</div>
						{#if canManage}
							<div class="flex flex-col gap-2 border-t pt-3 sm:flex-row">
								<Select.Root
									type="single"
									value={cycle.status}
									onValueChange={(value: string) => updateStatus(cycle.id, value)}
								>
									<Select.Trigger
										aria-label={`${m.ui_status_filter()}: ${cycle.name}`}
										size="sm"
										class="w-full text-xs sm:w-40">{statusLabel(cycle.status)}</Select.Trigger
									>
									<Select.Content>
										<Select.Item value="PLANNED" label={m.cycle_planned()} />
										<Select.Item value="IN_PROGRESS" label={m.cycle_in_progress()} />
										<Select.Item value="COMPLETED" label={m.cycle_completed()} />
									</Select.Content>
								</Select.Root>
								{#if canDelete}
									<Button
										variant="ghost"
										size="sm"
										class="text-destructive hover:text-destructive sm:ml-auto"
										onclick={() => (deleteTarget = cycle)}>{m.common_delete()}</Button
									>
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
				<div class="space-y-2 sm:col-span-2">
					<Label for="cycle-name">{m.cycle_name()}</Label><Input
						id="cycle-name"
						bind:value={createName}
					/>
				</div>
				<div class="space-y-2">
					<Label for="cycle-number">{m.cycle_number()}</Label><Input
						id="cycle-number"
						type="number"
						min="1"
						bind:value={createNumber}
					/>
				</div>
				<div class="space-y-2">
					<Label for="cycle-release">{m.nav_releases()}</Label>
					<Select.Root
						type="single"
						value={createReleaseId}
						onValueChange={(value: string) => (createReleaseId = value)}
					>
						<Select.Trigger id="cycle-release" class="w-full"
							><span class="truncate"
								>{createReleaseId
									? data.releases.find((item) => String(item.id) === createReleaseId)?.name
									: '-'}</span
							></Select.Trigger
						>
						<Select.Content
							><Select.Item value="" label="-" />{#each data.releases as item (item.id)}<Select.Item
									value={String(item.id)}
									label={`${item.name}${item.version ? ` (${item.version})` : ''}`}
								/>{/each}</Select.Content
						>
					</Select.Root>
				</div>
				<div class="space-y-2">
					<Label for="cycle-start">{m.cycle_start_date()}</Label><Input
						id="cycle-start"
						type="date"
						bind:value={createStartDate}
					/>
				</div>
				<div class="space-y-2">
					<Label for="cycle-end">{m.cycle_end_date()}</Label><Input
						id="cycle-end"
						type="date"
						min={createStartDate || undefined}
						bind:value={createEndDate}
					/>
				</div>
			</div>
			<Dialog.Footer>
				<Button variant="outline" class="w-full sm:w-auto" onclick={() => (createOpen = false)}
					>{m.common_cancel()}</Button
				>
				<Button
					class="w-full sm:w-auto"
					disabled={createSaving ||
						!createName.trim() ||
						createNumber < 1 ||
						(!!createStartDate && !!createEndDate && createEndDate < createStartDate)}
					onclick={createCycle}>{createSaving ? m.common_creating() : m.cycle_create()}</Button
				>
			</Dialog.Footer>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<AlertDialog.Root open={!!deleteTarget} onOpenChange={(open) => !open && (deleteTarget = null)}>
	<AlertDialog.Portal>
		<AlertDialog.Overlay />
		<AlertDialog.Content>
			<AlertDialog.Header
				><AlertDialog.Title>{m.cycle_delete_title()}</AlertDialog.Title><AlertDialog.Description
					>{m.cycle_delete_confirm()}</AlertDialog.Description
				></AlertDialog.Header
			>
			<AlertDialog.Footer
				><AlertDialog.Cancel>{m.common_cancel()}</AlertDialog.Cancel><Button
					variant="destructive"
					disabled={deleteSaving}
					onclick={deleteCycle}>{deleteSaving ? m.common_saving() : m.common_delete()}</Button
				></AlertDialog.Footer
			>
		</AlertDialog.Content>
	</AlertDialog.Portal>
</AlertDialog.Root>
