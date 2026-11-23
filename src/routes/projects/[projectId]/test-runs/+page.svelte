<script lang="ts">
	import { isInteractiveTarget } from '$lib/utils';
	import PageHeader from '$lib/components/patterns/PageHeader.svelte';
	import StatusFilter from '$lib/components/patterns/StatusFilter.svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { toast } from 'svelte-sonner';
	import * as Table from '$lib/components/ui/table/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import * as m from '$lib/paraglide/messages.js';
	import { apiPatch, apiPost, apiDelete } from '$lib/api-client';

	let { data } = $props();

	const basePath = $derived(`/projects/${data.project.id}/test-runs`);
	const canExecute = $derived(data.userRole !== 'VIEWER');
	const isAdmin = $derived(data.userRole === 'PROJECT_ADMIN' || data.userRole === 'ADMIN');

	// Edit dialog state
	let editDialogOpen = $state(false);
	let editRunId = $state<number | null>(null);
	let editRunName = $state('');
	let editRunEnv = $state('');
	let editRunSaving = $state(false);

	// Clone dialog state
	let cloneDialogOpen = $state(false);
	let cloneRunId = $state<number | null>(null);
	let cloneRunName = $state('');
	let cloneRunSaving = $state(false);

	// Retest dialog state
	let retestDialogOpen = $state(false);
	let retestRunId = $state<number | null>(null);
	let retestRunName = $state('');
	let retestRunSaving = $state(false);

	// Delete dialog state
	let deleteDialogOpen = $state(false);
	let deleteRunId = $state<number | null>(null);
	let deleteRunSaving = $state(false);

	// Compare state
	let compareSelectedIds = $state(new Set<number>());

	function toggleCompareRun(id: number) {
		const next = new Set(compareSelectedIds);
		if (next.has(id)) {
			next.delete(id);
		} else if (next.size < 2) {
			next.add(id);
		} else {
			// Replace oldest selection
			const arr = Array.from(next);
			next.delete(arr[0]);
			next.add(id);
		}
		compareSelectedIds = next;
	}

	const runName = (id: number) => data.runs.find((r) => r.id === id)?.name ?? `#${id}`;
	// Always mounted below, so a change in the selection is announced.
	const compareStatus = $derived.by(() => {
		const ids = Array.from(compareSelectedIds);
		if (ids.length === 1) return m.tr_compare_select_hint();
		if (ids.length === 2) return m.tr_compare_ready({ a: runName(ids[0]), b: runName(ids[1]) });
		return '';
	});

	function goToCompare() {
		const ids = Array.from(compareSelectedIds);
		if (ids.length === 2) {
			goto(`${basePath}/compare?runA=${ids[0]}&runB=${ids[1]}`);
		}
	}

	const environments = $derived(data.projectEnvironments);

	function openEdit(run: (typeof data.runs)[0]) {
		editRunId = run.id;
		editRunName = run.name;
		editRunEnv = run.environment;
		editDialogOpen = true;
	}

	function openClone(run: (typeof data.runs)[0]) {
		cloneRunId = run.id;
		cloneRunName = `Copy of ${run.name}`;
		cloneDialogOpen = true;
	}

	function openRetest(run: (typeof data.runs)[0]) {
		retestRunId = run.id;
		retestRunName = `Retest of ${run.name}`;
		retestDialogOpen = true;
	}

	function openDelete(run: (typeof data.runs)[0]) {
		deleteRunId = run.id;
		deleteDialogOpen = true;
	}

	async function handleEdit() {
		if (!editRunId) return;
		editRunSaving = true;
		try {
			await apiPatch(`/api/projects/${data.project.id}/test-runs/${editRunId}`, {
				name: editRunName,
				environment: editRunEnv
			});
			editDialogOpen = false;
			toast.success(m.tr_updated());
			await invalidateAll();
		} catch {
			// error toast handled by apiPatch
		} finally {
			editRunSaving = false;
		}
	}

	async function handleClone() {
		if (!cloneRunId) return;
		cloneRunSaving = true;
		try {
			const { id } = await apiPost<{ id: number }>(
				`/api/projects/${data.project.id}/test-runs/${cloneRunId}/clone`,
				{ name: cloneRunName }
			);
			cloneDialogOpen = false;
			toast.success(m.tr_cloned());
			goto(`${basePath}/${id}`);
		} catch {
			// error toast handled by apiPost
		} finally {
			cloneRunSaving = false;
		}
	}

	async function handleRetest() {
		if (!retestRunId) return;
		retestRunSaving = true;
		try {
			const { id } = await apiPost<{ id: number }>(
				`/api/projects/${data.project.id}/test-runs/${retestRunId}/retest`,
				{ name: retestRunName }
			);
			retestDialogOpen = false;
			toast.success(m.tr_retested());
			goto(`${basePath}/${id}`);
		} catch {
			// error toast handled by apiPost
		} finally {
			retestRunSaving = false;
		}
	}

	async function handleDelete() {
		if (!deleteRunId) return;
		deleteRunSaving = true;
		try {
			await apiDelete(`/api/projects/${data.project.id}/test-runs/${deleteRunId}`);
			deleteDialogOpen = false;
			toast.success(m.tr_deleted());
			await invalidateAll();
		} catch {
			// error toast handled by apiDelete
		} finally {
			deleteRunSaving = false;
		}
	}

	function setStatus(s: string) {
		const params = new URLSearchParams(page.url.searchParams);
		if (s) {
			params.set('status', s);
		} else {
			params.delete('status');
		}
		params.set('page', '1');
		goto(`${basePath}?${params.toString()}`, { keepFocus: true, noScroll: true });
	}

	function goToPage(p: number) {
		const params = new URLSearchParams(page.url.searchParams);
		params.set('page', String(p));
		goto(`${basePath}?${params.toString()}`);
	}

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

	function progressPercent(passed: number, total: number): number {
		if (total === 0) return 0;
		return Math.round((passed / total) * 100);
	}

	const statuses = ['', 'CREATED', 'IN_PROGRESS', 'COMPLETED'];
</script>

<div class="space-y-6">
	<PageHeader title={m.tr_title()}>
		{#snippet actions()}
			<div class="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
				{#if compareSelectedIds.size === 2}
					<Button variant="outline" class="w-full sm:w-auto" onclick={goToCompare}
						>{m.tr_compare()}</Button
					>
				{/if}
				{#if data.userRole !== 'VIEWER'}
					<Button href="{basePath}/new" class="w-full sm:w-auto">{m.tr_new()}</Button>
				{/if}
			</div>
		{/snippet}
	</PageHeader>
	<p role="status" class="text-xs text-muted-foreground empty:hidden">{compareStatus}</p>

	<StatusFilter
		value={data.statusFilter}
		onchange={setStatus}
		options={statuses.map((value) => ({
			value,
			label:
				value === 'CREATED'
					? m.common_created()
					: value === 'IN_PROGRESS'
						? m.cycle_in_progress()
						: value === 'COMPLETED'
							? m.cycle_completed()
							: m.common_all()
		}))}
	/>

	{#if data.runs.length === 0}
		<div
			class="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="48"
				height="48"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="1.5"
				stroke-linecap="round"
				stroke-linejoin="round"
				class="text-muted-foreground mb-4"
			>
				<path d="M5 22h14" />
				<path d="M5 2h14" />
				<path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22" />
				<path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2" />
			</svg>
			<h3 class="text-lg font-semibold">
				{data.statusFilter ? m.ui_no_filtered_results() : m.tr_empty_title()}
			</h3>
			<p class="text-muted-foreground mt-1 text-sm">
				{#if data.statusFilter}
					{m.tr_empty_filter()}
				{:else}
					{m.tr_empty_create()}
				{/if}
			</p>
			{#if data.statusFilter}
				<Button variant="outline" size="sm" class="mt-4" onclick={() => setStatus('')}
					>{m.ui_clear_filters()}</Button
				>
			{:else if data.userRole !== 'VIEWER'}
				<Button href="{basePath}/new" class="mt-4">{m.tr_create()}</Button>
			{/if}
		</div>
	{:else}
		<div class="overflow-x-auto rounded-md border">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head class="w-10 px-2 py-1"
							><span class="sr-only">{m.tr_compare()}</span></Table.Head
						>
						<Table.Head class="py-1 px-2 text-xs">{m.common_name()}</Table.Head>
						<Table.Head class="w-20 py-1 px-2 text-xs hidden sm:table-cell"
							>{m.common_environment()}</Table.Head
						>
						<Table.Head class="w-24 py-1 px-2 text-xs">{m.common_status()}</Table.Head>
						<Table.Head class="w-36 py-1 px-2 text-xs hidden md:table-cell"
							>{m.tr_progress()}</Table.Head
						>
						<Table.Head class="w-24 py-1 px-2 text-xs hidden lg:table-cell"
							>{m.tr_created_by()}</Table.Head
						>
						<Table.Head class="w-28 py-1 px-2 text-xs hidden lg:table-cell"
							>{m.tr_created_at()}</Table.Head
						>
						{#if canExecute}
							<Table.Head class="w-16 py-1 px-2 text-xs">{m.common_actions()}</Table.Head>
						{/if}
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.runs as run (run.id)}
						{@const pct = progressPercent(run.passedCount, run.totalCount)}
						<Table.Row
							class="cursor-pointer hover:bg-muted/50"
							onclick={(event) => {
								if (!isInteractiveTarget(event.target)) goto(`${basePath}/${run.id}`);
							}}
						>
							<Table.Cell class="px-2 py-1" onclick={(e: MouseEvent) => e.stopPropagation()}>
								<!-- The label widens the touch target to 40px without making the row taller. -->
								<label class="-m-3 flex size-10 cursor-pointer items-center justify-center">
									<input
										type="checkbox"
										aria-label={`${m.tr_compare()}: ${run.name}`}
										checked={compareSelectedIds.has(run.id)}
										onchange={() => toggleCompareRun(run.id)}
										class="size-4 rounded border-muted-foreground"
									/>
								</label>
							</Table.Cell>
							<Table.Cell class="py-1 px-2 text-xs font-medium">
								<div class="flex items-center gap-1.5">
									<a href={`${basePath}/${run.id}`} class="underline-offset-4 hover:underline"
										>{run.name}</a
									>
									{#if run.retestOfRunId}
										<Badge variant="secondary" class="text-[9px] px-1 py-0"
											>{m.tr_retest_badge()}</Badge
										>
									{/if}
								</div>
								<div class="text-muted-foreground sm:hidden text-[10px]">
									{run.environment} &middot; {pct}%
								</div>
							</Table.Cell>
							<Table.Cell class="py-1 px-2 hidden sm:table-cell">
								<Badge variant="outline" class="text-[10px] px-1.5 py-0">{run.environment}</Badge>
							</Table.Cell>
							<Table.Cell class="py-1 px-2">
								<Badge variant={statusVariant(run.status)} class="text-[10px] px-1.5 py-0">
									{run.status.replace('_', ' ')}
								</Badge>
							</Table.Cell>
							<Table.Cell class="py-1 px-2 hidden md:table-cell">
								<div
									class="flex items-center gap-1"
									title="{m.dashboard_pass()}: {run.passedCount} / {m.common_all()}: {run.totalCount} ({pct}%)"
								>
									<div class="bg-secondary h-1.5 w-full rounded-full">
										<div
											class="bg-primary h-1.5 rounded-full transition-all"
											style="width: {pct}%"
										></div>
									</div>
									<span class="text-muted-foreground w-16 text-right text-[10px]">
										{pct}% ({run.passedCount}/{run.totalCount})
									</span>
								</div>
							</Table.Cell>
							<Table.Cell class="text-muted-foreground py-1 px-2 text-xs hidden lg:table-cell"
								>{run.createdBy}</Table.Cell
							>
							<Table.Cell class="text-muted-foreground py-1 px-2 text-xs hidden lg:table-cell">
								{new Date(run.createdAt).toLocaleDateString()}
							</Table.Cell>
							{#if canExecute}
								<Table.Cell class="py-1 px-2">
									<DropdownMenu.Root>
										<DropdownMenu.Trigger>
											{#snippet child({ props })}
												<Button
													variant="ghost"
													size="sm"
													class="size-10 p-0 sm:size-6"
													{...props}
													onclick={(e: MouseEvent) => e.stopPropagation()}
													aria-label={m.common_actions()}
												>
													<svg
														xmlns="http://www.w3.org/2000/svg"
														width="14"
														height="14"
														viewBox="0 0 24 24"
														fill="none"
														stroke="currentColor"
														stroke-width="2"
														stroke-linecap="round"
														stroke-linejoin="round"
														aria-hidden="true"
														><circle cx="12" cy="12" r="1" /><circle cx="12" cy="5" r="1" /><circle
															cx="12"
															cy="19"
															r="1"
														/></svg
													>
												</Button>
											{/snippet}
										</DropdownMenu.Trigger>
										<DropdownMenu.Content align="end">
											{#if run.status === 'CREATED'}
												<DropdownMenu.Item
													onclick={() => {
														openEdit(run);
													}}
												>
													{m.tr_edit()}
												</DropdownMenu.Item>
											{/if}
											<DropdownMenu.Item
												onclick={() => {
													openClone(run);
												}}
											>
												{m.tr_clone()}
											</DropdownMenu.Item>
											<DropdownMenu.Item
												onclick={() => {
													openRetest(run);
												}}
											>
												{m.tr_retest()}
											</DropdownMenu.Item>
											{#if isAdmin}
												<DropdownMenu.Separator />
												<DropdownMenu.Item
													class="text-destructive"
													onclick={() => {
														openDelete(run);
													}}
												>
													{m.tr_delete()}
												</DropdownMenu.Item>
											{/if}
										</DropdownMenu.Content>
									</DropdownMenu.Root>
								</Table.Cell>
							{/if}
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</div>

		{#if data.meta.totalPages > 1}
			<nav
				class="flex flex-col items-stretch justify-center gap-2 sm:flex-row sm:items-center"
				aria-label={m.pagination_label()}
			>
				<Button
					variant="outline"
					size="sm"
					class="h-10 w-full px-2 text-xs sm:h-7 sm:w-auto"
					disabled={data.meta.page <= 1}
					onclick={() => goToPage(data.meta.page - 1)}
				>
					{m.common_previous()}
				</Button>
				<span class="text-muted-foreground text-center text-xs">
					{m.common_page_of({ page: data.meta.page, totalPages: data.meta.totalPages })}
				</span>
				<Button
					variant="outline"
					size="sm"
					class="h-10 w-full px-2 text-xs sm:h-7 sm:w-auto"
					disabled={data.meta.page >= data.meta.totalPages}
					onclick={() => goToPage(data.meta.page + 1)}
				>
					{m.common_next()}
				</Button>
			</nav>
		{/if}
	{/if}
</div>

<!-- Edit Run Dialog -->
<Dialog.Root bind:open={editDialogOpen}>
	<Dialog.Portal>
		<Dialog.Overlay />
		<Dialog.Content class="sm:max-w-md">
			<Dialog.Header>
				<Dialog.Title>{m.tr_edit_title()}</Dialog.Title>
			</Dialog.Header>
			<div class="space-y-4 py-4">
				<div class="space-y-2">
					<Label for="editName">{m.tr_run_name()}</Label>
					<Input id="editName" bind:value={editRunName} />
				</div>
				<div class="space-y-2">
					<Label for="editEnv">{m.common_environment()}</Label>
					<Select.Root
						type="single"
						value={editRunEnv}
						onValueChange={(v: string) => {
							editRunEnv = v;
						}}
					>
						<Select.Trigger id="editEnv" class="w-full">
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
				<Button
					variant="outline"
					class="w-full sm:w-auto"
					onclick={() => (editDialogOpen = false)}
					disabled={editRunSaving}
				>
					{m.common_cancel()}
				</Button>
				<Button
					class="w-full sm:w-auto"
					onclick={handleEdit}
					disabled={editRunSaving || !editRunName.trim()}
				>
					{#if editRunSaving}
						<svg
							class="mr-2 h-4 w-4 animate-spin"
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 24 24"
							><circle
								class="opacity-25"
								cx="12"
								cy="12"
								r="10"
								stroke="currentColor"
								stroke-width="4"
							></circle><path
								class="opacity-75"
								fill="currentColor"
								d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
							></path></svg
						>
						{m.common_saving()}
					{:else}
						{m.common_save_changes()}
					{/if}
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
					<Label for="cloneName">{m.tr_clone_name_label()}</Label>
					<Input id="cloneName" bind:value={cloneRunName} />
				</div>
			</div>
			<Dialog.Footer>
				<Button
					variant="outline"
					class="w-full sm:w-auto"
					onclick={() => (cloneDialogOpen = false)}
					disabled={cloneRunSaving}
				>
					{m.common_cancel()}
				</Button>
				<Button
					class="w-full sm:w-auto"
					onclick={handleClone}
					disabled={cloneRunSaving || !cloneRunName.trim()}
				>
					{#if cloneRunSaving}
						<svg
							class="mr-2 h-4 w-4 animate-spin"
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 24 24"
							><circle
								class="opacity-25"
								cx="12"
								cy="12"
								r="10"
								stroke="currentColor"
								stroke-width="4"
							></circle><path
								class="opacity-75"
								fill="currentColor"
								d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
							></path></svg
						>
						{m.common_creating()}
					{:else}
						{m.tr_clone()}
					{/if}
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
				<div class="space-y-2">
					<Label for="retestName">{m.tr_retest_name_label()}</Label>
					<Input id="retestName" bind:value={retestRunName} />
				</div>
			</div>
			<Dialog.Footer>
				<Button
					variant="outline"
					class="w-full sm:w-auto"
					onclick={() => (retestDialogOpen = false)}
					disabled={retestRunSaving}
				>
					{m.common_cancel()}
				</Button>
				<Button
					class="w-full sm:w-auto"
					onclick={handleRetest}
					disabled={retestRunSaving || !retestRunName.trim()}
				>
					{#if retestRunSaving}
						<svg
							class="mr-2 h-4 w-4 animate-spin"
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 24 24"
							><circle
								class="opacity-25"
								cx="12"
								cy="12"
								r="10"
								stroke="currentColor"
								stroke-width="4"
							></circle><path
								class="opacity-75"
								fill="currentColor"
								d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
							></path></svg
						>
						{m.common_creating()}
					{:else}
						{m.tr_retest()}
					{/if}
				</Button>
			</Dialog.Footer>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<!-- Delete Run Dialog -->
<AlertDialog.Root bind:open={deleteDialogOpen}>
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
				<AlertDialog.Cancel class="w-full sm:w-auto" disabled={deleteRunSaving}>
					{m.common_cancel()}
				</AlertDialog.Cancel>
				<Button
					variant="destructive"
					class="w-full sm:w-auto"
					onclick={handleDelete}
					disabled={deleteRunSaving}
				>
					{#if deleteRunSaving}
						<svg
							class="mr-2 h-4 w-4 animate-spin"
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 24 24"
							><circle
								class="opacity-25"
								cx="12"
								cy="12"
								r="10"
								stroke="currentColor"
								stroke-width="4"
							></circle><path
								class="opacity-75"
								fill="currentColor"
								d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
							></path></svg
						>
						{m.common_saving()}
					{:else}
						{m.common_delete()}
					{/if}
				</Button>
			</AlertDialog.Footer>
		</AlertDialog.Content>
	</AlertDialog.Portal>
</AlertDialog.Root>
