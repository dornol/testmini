<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import * as m from '$lib/paraglide/messages.js';
	import { apiPatch, apiDelete } from '$lib/api-client';

	let { data } = $props();

	const basePath = $derived(`/projects/${data.project.id}/releases`);
	const canManage = $derived(
		data.userRole === 'PROJECT_ADMIN' || data.userRole === 'QA' || data.userRole === 'ADMIN'
	);
	const canDelete = $derived(
		data.userRole === 'PROJECT_ADMIN' || data.userRole === 'ADMIN'
	);

	const statuses = ['PLANNING', 'IN_PROGRESS', 'READY', 'RELEASED'] as const;

	function statusLabel(s: string) {
		const map: Record<string, () => string> = {
			PLANNING: m.rel_status_planning,
			IN_PROGRESS: m.rel_status_in_progress,
			READY: m.rel_status_ready,
			RELEASED: m.rel_status_released
		};
		return map[s]?.() ?? s;
	}

	function statusVariant(s: string): 'default' | 'secondary' | 'outline' | 'destructive' {
		switch (s) {
			case 'PLANNING': return 'outline';
			case 'IN_PROGRESS': return 'secondary';
			case 'READY': return 'default';
			case 'RELEASED': return 'default';
			default: return 'outline';
		}
	}

	function verdictColor(v: string) {
		switch (v) {
			case 'GO': return 'bg-green-500/10 text-green-600 border-green-500/20';
			case 'NO_GO': return 'bg-red-500/10 text-red-600 border-red-500/20';
			case 'CAUTION': return 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20';
			default: return '';
		}
	}

	function verdictLabel(v: string) {
		const map: Record<string, () => string> = { GO: m.rel_go, NO_GO: m.rel_no_go, CAUTION: m.rel_caution };
		return map[v]?.() ?? v;
	}

	async function handleStatusChange(newStatus: string) {
		try {
			await apiPatch(`/api/projects/${data.project.id}/releases/${data.release.id}`, { status: newStatus });
			toast.success(m.rel_updated());
			await invalidateAll();
		} catch { /* handled */ }
	}

	// Delete
	let deleteDialogOpen = $state(false);
	let deleteSaving = $state(false);

	async function handleDelete() {
		deleteSaving = true;
		try {
			await apiDelete(`/api/projects/${data.project.id}/releases/${data.release.id}`);
			toast.success(m.rel_deleted());
			goto(basePath);
		} catch { /* handled */ }
		finally { deleteSaving = false; }
	}

	// Link plan/run dialogs
	let linkPlanDialogOpen = $state(false);
	let linkRunDialogOpen = $state(false);
	let selectedLinkId = $state<number | null>(null);

	async function handleLinkPlan() {
		if (!selectedLinkId) return;
		try {
			await apiPatch(`/api/projects/${data.project.id}/test-plans/${selectedLinkId}`, { releaseId: data.release.id });
			linkPlanDialogOpen = false;
			selectedLinkId = null;
			toast.success(m.rel_updated());
			await invalidateAll();
		} catch { /* handled */ }
	}

	async function handleLinkRun() {
		if (!selectedLinkId) return;
		try {
			await apiPatch(`/api/projects/${data.project.id}/test-runs/${selectedLinkId}`, { releaseId: data.release.id });
			linkRunDialogOpen = false;
			selectedLinkId = null;
			toast.success(m.rel_updated());
			await invalidateAll();
		} catch { /* handled */ }
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
				&larr; {m.common_back_to({ target: m.rel_title() })}
			</a>
			<div class="mt-1 flex items-center gap-3">
				<h2 class="text-xl font-bold">{data.release.name}</h2>
				{#if data.release.version}
					<Badge variant="outline">{data.release.version}</Badge>
				{/if}
				<Select.Root
					type="single"
					value={data.release.status}
					onValueChange={(v: string) => handleStatusChange(v)}
				>
					<Select.Trigger class="w-36 h-7 text-xs">
						<Badge variant={statusVariant(data.release.status)}>{statusLabel(data.release.status)}</Badge>
					</Select.Trigger>
					<Select.Content>
						{#each statuses as s}
							<Select.Item value={s} label={statusLabel(s)} />
						{/each}
					</Select.Content>
				</Select.Root>
			</div>
			{#if data.release.targetDate || data.release.releaseDate}
				<p class="text-muted-foreground mt-1 text-sm">
					{m.rel_target_date()}: {formatDate(data.release.targetDate)}
					{#if data.release.releaseDate}
						&middot; {m.rel_release_date()}: {formatDate(data.release.releaseDate)}
					{/if}
				</p>
			{/if}
			{#if data.release.description}
				<p class="text-muted-foreground mt-1 text-sm">{data.release.description}</p>
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

	<!-- Readiness Card -->
	<Card.Root>
		<Card.Content class="p-4">
			<div class="flex items-center justify-between">
				<div>
					<h3 class="font-semibold text-sm">{m.rel_readiness()}</h3>
					<div class="mt-2 flex items-center gap-4">
						<span class={`rounded-md border px-3 py-1 text-lg font-bold ${verdictColor(data.verdict)}`}>
							{verdictLabel(data.verdict)}
						</span>
						<span class="text-muted-foreground text-sm">
							{m.rel_pass_rate()}: {data.stats.passRate}%
						</span>
					</div>
				</div>
				<div class="flex gap-4 text-center text-sm">
					<div>
						<div class="text-lg font-bold text-green-600">{data.stats.pass}</div>
						<div class="text-muted-foreground text-xs">{m.dashboard_pass()}</div>
					</div>
					<div>
						<div class="text-lg font-bold text-red-600">{data.stats.fail}</div>
						<div class="text-muted-foreground text-xs">{m.dashboard_fail()}</div>
					</div>
					<div>
						<div class="text-lg font-bold text-yellow-600">{data.stats.blocked}</div>
						<div class="text-muted-foreground text-xs">{m.dashboard_blocked()}</div>
					</div>
					<div>
						<div class="text-lg font-bold text-gray-500">{data.stats.pending}</div>
						<div class="text-muted-foreground text-xs">{m.dashboard_pending()}</div>
					</div>
				</div>
			</div>
		</Card.Content>
	</Card.Root>

	<!-- Linked Plans -->
	<div class="space-y-2">
		<div class="flex items-center justify-between">
			<h3 class="font-semibold">{m.rel_linked_plans()} ({data.plans.length})</h3>
			{#if canManage && data.availablePlans.length > 0}
				<Button variant="outline" size="sm" onclick={() => { selectedLinkId = null; linkPlanDialogOpen = true; }}>
					{m.rel_link_plan()}
				</Button>
			{/if}
		</div>
		{#if data.plans.length === 0}
			<div class="rounded-lg border border-dashed p-4 text-center">
				<p class="text-muted-foreground text-sm">{m.tp_no_runs()}</p>
			</div>
		{:else}
			<Card.Root>
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>{m.common_name()}</Table.Head>
							<Table.Head class="w-28">{m.common_status()}</Table.Head>
							<Table.Head class="w-28">{m.tp_milestone()}</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each data.plans as plan (plan.id)}
							<Table.Row
								class="cursor-pointer hover:bg-muted/50"
								onclick={() => goto(`/projects/${data.project.id}/test-plans/${plan.id}`)}
							>
								<Table.Cell class="font-medium">{plan.name}</Table.Cell>
								<Table.Cell><Badge variant="secondary">{plan.status}</Badge></Table.Cell>
								<Table.Cell class="text-muted-foreground text-sm">{plan.milestone ?? '-'}</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</Card.Root>
		{/if}
	</div>

	<!-- Linked Runs -->
	<div class="space-y-2">
		<div class="flex items-center justify-between">
			<h3 class="font-semibold">{m.rel_linked_runs()} ({data.runs.length})</h3>
			{#if canManage && data.availableRuns.length > 0}
				<Button variant="outline" size="sm" onclick={() => { selectedLinkId = null; linkRunDialogOpen = true; }}>
					{m.rel_link_run()}
				</Button>
			{/if}
		</div>
		{#if data.runs.length === 0}
			<div class="rounded-lg border border-dashed p-4 text-center">
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
							<Table.Head class="w-20">{m.dashboard_pass()}</Table.Head>
							<Table.Head class="w-20">{m.dashboard_fail()}</Table.Head>
							<Table.Head class="w-20">{m.rel_pass_rate()}</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each data.runs as run (run.id)}
							{@const total = Number(run.total)}
							{@const pass = Number(run.pass)}
							{@const rate = total > 0 ? Math.round((pass / total) * 100) : 0}
							<Table.Row
								class="cursor-pointer hover:bg-muted/50"
								onclick={() => goto(`/projects/${data.project.id}/test-runs/${run.id}`)}
							>
								<Table.Cell class="font-medium">{run.name}</Table.Cell>
								<Table.Cell>
									<Badge variant={run.status === 'COMPLETED' ? 'default' : 'secondary'}>{run.status}</Badge>
								</Table.Cell>
								<Table.Cell class="text-muted-foreground text-sm">{run.environment}</Table.Cell>
								<Table.Cell class="text-green-600">{pass}</Table.Cell>
								<Table.Cell class="text-red-600">{run.fail}</Table.Cell>
								<Table.Cell>{rate}%</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</Card.Root>
		{/if}
	</div>
</div>

<!-- Delete Dialog -->
<AlertDialog.Root bind:open={deleteDialogOpen}>
	<AlertDialog.Portal>
		<AlertDialog.Overlay />
		<AlertDialog.Content>
			<AlertDialog.Header>
				<AlertDialog.Title>{m.rel_delete_title()}</AlertDialog.Title>
				<AlertDialog.Description>{m.rel_delete_confirm()}</AlertDialog.Description>
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

<!-- Link Plan Dialog -->
<Dialog.Root bind:open={linkPlanDialogOpen}>
	<Dialog.Portal>
		<Dialog.Overlay />
		<Dialog.Content class="sm:max-w-md">
			<Dialog.Header>
				<Dialog.Title>{m.rel_link_plan()}</Dialog.Title>
			</Dialog.Header>
			<div class="py-4 space-y-2 max-h-60 overflow-auto">
				{#each data.availablePlans as plan (plan.id)}
					<button
						class="w-full text-left px-3 py-2 rounded-md hover:bg-muted/50 flex items-center justify-between {selectedLinkId === plan.id ? 'bg-muted' : ''}"
						onclick={() => { selectedLinkId = plan.id; }}
					>
						<span class="text-sm font-medium">{plan.name}</span>
						<Badge variant="secondary" class="text-xs">{plan.status}</Badge>
					</button>
				{/each}
			</div>
			<Dialog.Footer>
				<Button variant="outline" onclick={() => (linkPlanDialogOpen = false)}>{m.common_cancel()}</Button>
				<Button onclick={handleLinkPlan} disabled={!selectedLinkId}>{m.rel_link_plan()}</Button>
			</Dialog.Footer>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<!-- Link Run Dialog -->
<Dialog.Root bind:open={linkRunDialogOpen}>
	<Dialog.Portal>
		<Dialog.Overlay />
		<Dialog.Content class="sm:max-w-md">
			<Dialog.Header>
				<Dialog.Title>{m.rel_link_run()}</Dialog.Title>
			</Dialog.Header>
			<div class="py-4 space-y-2 max-h-60 overflow-auto">
				{#each data.availableRuns as run (run.id)}
					<button
						class="w-full text-left px-3 py-2 rounded-md hover:bg-muted/50 flex items-center justify-between {selectedLinkId === run.id ? 'bg-muted' : ''}"
						onclick={() => { selectedLinkId = run.id; }}
					>
						<span class="text-sm font-medium">{run.name}</span>
						<div class="flex gap-1">
							<Badge variant="secondary" class="text-xs">{run.status}</Badge>
							<Badge variant="outline" class="text-xs">{run.environment}</Badge>
						</div>
					</button>
				{/each}
			</div>
			<Dialog.Footer>
				<Button variant="outline" onclick={() => (linkRunDialogOpen = false)}>{m.common_cancel()}</Button>
				<Button onclick={handleLinkRun} disabled={!selectedLinkId}>{m.rel_link_run()}</Button>
			</Dialog.Footer>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
