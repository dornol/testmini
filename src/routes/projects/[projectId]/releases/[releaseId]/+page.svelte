<script lang="ts">
	import { tick } from 'svelte';
	import { Input } from '$lib/components/ui/input';
	import FormErrorSummary from '$lib/components/patterns/FormErrorSummary.svelte';
	import { isInteractiveTarget } from '$lib/utils';
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
	import { apiPatch, apiDelete, apiFetch } from '$lib/api-client';

	let { data } = $props();

	const basePath = $derived(`/projects/${data.project.id}/releases`);
	const canManage = $derived(
		data.userRole === 'PROJECT_ADMIN' || data.userRole === 'QA' || data.userRole === 'ADMIN'
	);
	const canDelete = $derived(data.userRole === 'PROJECT_ADMIN' || data.userRole === 'ADMIN');

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
			case 'PLANNING':
				return 'outline';
			case 'IN_PROGRESS':
				return 'secondary';
			case 'READY':
				return 'default';
			case 'RELEASED':
				return 'default';
			default:
				return 'outline';
		}
	}

	function verdictColor(v: string) {
		switch (v) {
			case 'GO':
				return 'bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20';
			case 'NO_GO':
				return 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20';
			case 'CAUTION':
				return 'bg-yellow-500/10 text-yellow-800 dark:text-yellow-300 border-yellow-500/20';
			default:
				return '';
		}
	}

	function verdictLabel(v: string) {
		const map: Record<string, () => string> = {
			GO: m.rel_go,
			NO_GO: m.rel_no_go,
			CAUTION: m.rel_caution
		};
		return map[v]?.() ?? v;
	}

	async function handleStatusChange(newStatus: string) {
		try {
			await apiPatch(`/api/projects/${data.project.id}/releases/${data.release.id}`, {
				status: newStatus
			});
			toast.success(m.rel_updated());
			await invalidateAll();
		} catch {
			/* handled */
		}
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
		} catch {
			/* handled */
		} finally {
			deleteSaving = false;
		}
	}

	let linkOpen = $state(false);
	let linkKind = $state<'test-plans' | 'test-runs'>('test-plans');
	let selectedLinkId = $state<number | null>(null);
	let linkQuery = $state('');
	let linkSaving = $state(false);
	let linkFailed = $state(false);
	let linkSummary = $state<HTMLDivElement | null>(null);
	const linkTitle = $derived(linkKind === 'test-plans' ? m.rel_link_plan() : m.rel_link_run());
	const candidates = $derived(linkKind === 'test-plans' ? data.availablePlans : data.availableRuns);
	const selectedCandidate = $derived(candidates.find((item) => item.id === selectedLinkId));
	const filteredCandidates = $derived(
		candidates.filter((item) =>
			item.name.toLocaleLowerCase().includes(linkQuery.trim().toLocaleLowerCase())
		)
	);

	function openLink(kind: typeof linkKind) {
		linkKind = kind;
		selectedLinkId = null;
		linkQuery = '';
		linkFailed = false;
		linkOpen = true;
	}

	async function linkResource(event: SubmitEvent) {
		event.preventDefault();
		if (!selectedCandidate || linkSaving) return;

		linkSaving = true;
		linkFailed = false;
		try {
			await apiFetch(`/api/projects/${data.project.id}/${linkKind}/${selectedCandidate.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ releaseId: data.release.id }),
				silent: true
			});
		} catch {
			linkFailed = true;
			linkSaving = false;
			await tick();
			linkSummary?.focus();
			return;
		}
		linkSaving = false;
		linkOpen = false;
		toast.success(m.rel_updated());
		await invalidateAll();
	}

	function formatDate(date: string | Date | null) {
		if (!date) return '-';
		return new Date(date).toLocaleDateString();
	}
</script>

<div class="space-y-4">
	<!-- Header -->
	<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
		<div class="min-w-0">
			<a href={basePath} class="text-muted-foreground hover:text-foreground text-sm">
				&larr; {m.common_back_to({ target: m.rel_title() })}
			</a>
			<div class="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
				<h2 class="min-w-0 text-xl font-bold leading-tight break-words">{data.release.name}</h2>
				<div class="flex flex-wrap items-center gap-2">
					{#if data.release.version}
						<Badge variant="outline">{data.release.version}</Badge>
					{/if}
					<Select.Root
						type="single"
						value={data.release.status}
						onValueChange={(v: string) => handleStatusChange(v)}
					>
						<Select.Trigger class="h-7 w-36 text-xs">
							<Badge variant={statusVariant(data.release.status)}
								>{statusLabel(data.release.status)}</Badge
							>
						</Select.Trigger>
						<Select.Content>
							{#each statuses as s}
								<Select.Item value={s} label={statusLabel(s)} />
							{/each}
						</Select.Content>
					</Select.Root>
				</div>
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
		<div class="grid w-full shrink-0 gap-2 sm:w-auto sm:flex sm:justify-end">
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

	<!-- Readiness Card -->
	<Card.Root>
		<Card.Content class="p-4">
			<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<h3 class="font-semibold text-sm">{m.rel_readiness()}</h3>
					<div class="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
						<span
							class={`w-fit rounded-md border px-3 py-1 text-lg font-bold ${verdictColor(data.verdict)}`}
						>
							{verdictLabel(data.verdict)}
						</span>
						<span class="text-muted-foreground text-sm">
							{m.rel_pass_rate()}: {data.stats.passRate}%
						</span>
					</div>
				</div>
				<div
					class="grid w-full grid-cols-2 gap-3 text-center text-sm sm:w-auto sm:grid-cols-4 sm:gap-4"
				>
					<div>
						<div class="text-lg font-bold text-green-700 dark:text-green-400">
							{data.stats.pass}
						</div>
						<div class="text-muted-foreground text-xs">{m.dashboard_pass()}</div>
					</div>
					<div>
						<div class="text-lg font-bold text-red-700 dark:text-red-400">{data.stats.fail}</div>
						<div class="text-muted-foreground text-xs">{m.dashboard_fail()}</div>
					</div>
					<div>
						<div class="text-lg font-bold text-yellow-800 dark:text-yellow-300">
							{data.stats.blocked}
						</div>
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
		<div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
			<h3 class="font-semibold">{m.rel_linked_plans()} ({data.plans.length})</h3>
			{#if canManage}
				<Button
					variant="outline"
					size="sm"
					class="w-full sm:w-auto"
					onclick={() => openLink('test-plans')}
				>
					{m.rel_link_plan()}
				</Button>
			{/if}
		</div>
		{#if data.plans.length === 0}
			<div class="rounded-lg border border-dashed p-4 text-center">
				<p class="text-muted-foreground text-sm">{m.rel_no_linked_plans()}</p>
			</div>
		{:else}
			<div class="grid gap-3 md:hidden">
				{#each data.plans as plan (plan.id)}
					<a
						href={`/projects/${data.project.id}/test-plans/${plan.id}`}
						class="block min-w-0 rounded-md border p-3 text-left transition-colors hover:bg-muted/50"
					>
						<div class="font-medium [overflow-wrap:anywhere]">{plan.name}</div>
						<div class="mt-2 flex flex-wrap items-center gap-2">
							<Badge variant="secondary">{plan.status}</Badge>
							<span class="text-xs text-muted-foreground"
								>{m.tp_milestone()}: {plan.milestone ?? '-'}</span
							>
						</div>
					</a>
				{/each}
			</div>
			<Card.Root class="hidden md:block">
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
								onclick={(event) => {
									if (!isInteractiveTarget(event.target))
										void goto(`/projects/${data.project.id}/test-plans/${plan.id}`);
								}}
							>
								<Table.Cell class="font-medium"
									><a
										href={`/projects/${data.project.id}/test-plans/${plan.id}`}
										class="underline-offset-4 hover:underline">{plan.name}</a
									></Table.Cell
								>
								<Table.Cell><Badge variant="secondary">{plan.status}</Badge></Table.Cell>
								<Table.Cell class="text-muted-foreground text-sm"
									>{plan.milestone ?? '-'}</Table.Cell
								>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</Card.Root>
		{/if}
	</div>

	<!-- Linked Runs -->
	<div class="space-y-2">
		<div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
			<h3 class="font-semibold">{m.rel_linked_runs()} ({data.runs.length})</h3>
			{#if canManage}
				<Button
					variant="outline"
					size="sm"
					class="w-full sm:w-auto"
					onclick={() => openLink('test-runs')}
				>
					{m.rel_link_run()}
				</Button>
			{/if}
		</div>
		{#if data.runs.length === 0}
			<div class="rounded-lg border border-dashed p-4 text-center">
				<p class="text-muted-foreground text-sm">{m.rel_no_linked_runs()}</p>
			</div>
		{:else}
			<div class="grid gap-3 md:hidden">
				{#each data.runs as run (run.id)}
					{@const total = Number(run.total)}
					{@const pass = Number(run.pass)}
					{@const rate = total > 0 ? Math.round((pass / total) * 100) : 0}
					<a
						href={`/projects/${data.project.id}/test-runs/${run.id}`}
						class="block min-w-0 rounded-md border p-3 text-left transition-colors hover:bg-muted/50"
					>
						<div class="font-medium [overflow-wrap:anywhere]">{run.name}</div>
						<div class="mt-2 flex flex-wrap items-center gap-2">
							<Badge variant={run.status === 'COMPLETED' ? 'default' : 'secondary'}
								>{run.status}</Badge
							>
							<Badge variant="outline">{run.environment}</Badge>
						</div>
						<div class="mt-3 grid grid-cols-1 gap-2 text-xs min-[360px]:grid-cols-3">
							<div>
								<div class="text-muted-foreground">{m.dashboard_pass()}</div>
								<div class="font-medium text-green-700 dark:text-green-400">{pass}</div>
							</div>
							<div>
								<div class="text-muted-foreground">{m.dashboard_fail()}</div>
								<div class="font-medium text-red-700 dark:text-red-400">{run.fail}</div>
							</div>
							<div>
								<div class="text-muted-foreground">{m.rel_pass_rate()}</div>
								<div class="font-medium">{rate}%</div>
							</div>
						</div>
					</a>
				{/each}
			</div>
			<Card.Root class="hidden md:block">
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
								onclick={(event) => {
									if (!isInteractiveTarget(event.target))
										void goto(`/projects/${data.project.id}/test-runs/${run.id}`);
								}}
							>
								<Table.Cell class="font-medium"
									><a
										href={`/projects/${data.project.id}/test-runs/${run.id}`}
										class="underline-offset-4 hover:underline">{run.name}</a
									></Table.Cell
								>
								<Table.Cell>
									<Badge variant={run.status === 'COMPLETED' ? 'default' : 'secondary'}
										>{run.status}</Badge
									>
								</Table.Cell>
								<Table.Cell class="text-muted-foreground text-sm">{run.environment}</Table.Cell>
								<Table.Cell class="text-green-700 dark:text-green-400">{pass}</Table.Cell>
								<Table.Cell class="text-red-700 dark:text-red-400">{run.fail}</Table.Cell>
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

<Dialog.Root bind:open={linkOpen}>
	<Dialog.Content
		class="sm:max-w-md"
		showCloseButton={!linkSaving}
		interactOutsideBehavior="ignore"
		escapeKeydownBehavior={linkSaving ? 'ignore' : 'close'}
	>
		<Dialog.Header>
			<Dialog.Title>{linkTitle}</Dialog.Title>
			<Dialog.Description>{m.rel_choose_unlinked()}</Dialog.Description>
		</Dialog.Header>
		<form class="min-w-0 space-y-4" aria-busy={linkSaving} onsubmit={linkResource}>
			<FormErrorSummary
				errors={linkFailed ? [{ path: '_form', messages: [m.ui_save_failed()] }] : []}
				bind:ref={linkSummary}
				fieldTarget={() => undefined}
			/>
			{#if candidates.length === 0}
				<p class="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
					{linkKind === 'test-plans' ? m.rel_no_available_plans() : m.rel_no_available_runs()}
				</p>
			{:else}
				<div class="space-y-2">
					<label for="release-link-search" class="text-sm font-medium">{m.common_search()}</label>
					<Input
						id="release-link-search"
						type="search"
						bind:value={linkQuery}
						disabled={linkSaving}
						onkeydown={(event) => {
							if (event.key === 'Enter') event.preventDefault();
						}}
					/>
				</div>
				{#if filteredCandidates.length === 0}
					<p
						role="status"
						class="rounded-md border border-dashed p-4 text-sm text-muted-foreground"
					>
						{m.ui_no_filtered_results()}
					</p>
				{:else}
					<fieldset disabled={linkSaving} class="min-w-0">
						<legend class="sr-only">{linkTitle}</legend>
						<div class="max-h-60 space-y-1 overflow-y-auto p-1">
							{#each filteredCandidates as item (item.id)}
								<label
									class="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3 py-2 hover:bg-muted/50 has-checked:border-primary has-checked:bg-accent"
								>
									<input
										type="radio"
										name="release-link-candidate"
										bind:group={selectedLinkId}
										value={item.id}
										class="size-4 shrink-0"
									/>
									<span class="min-w-0 flex-1">
										<span class="block text-sm font-medium [overflow-wrap:anywhere]"
											>{item.name}</span
										>
										<span
											class="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
										>
											<Badge variant="secondary">{item.status}</Badge>
											{#if 'environment' in item}
												<span class="min-w-0 [overflow-wrap:anywhere]">{item.environment}</span>
											{/if}
										</span>
									</span>
								</label>
							{/each}
						</div>
					</fieldset>
				{/if}
				{#if selectedCandidate && !filteredCandidates.includes(selectedCandidate)}
					<p role="status" class="text-sm text-muted-foreground [overflow-wrap:anywhere]">
						{m.rel_link_selected({ name: selectedCandidate.name })}
					</p>
				{/if}
			{/if}
			<Dialog.Footer>
				<Button
					type="button"
					variant="outline"
					disabled={linkSaving}
					onclick={() => (linkOpen = false)}>{m.common_cancel()}</Button
				>
				{#if candidates.length}
					<Button type="submit" disabled={!selectedCandidate || linkSaving}
						>{linkSaving ? m.common_saving() : linkTitle}</Button
					>
				{:else}
					<Button href={`/projects/${data.project.id}/${linkKind}`}
						>{linkKind === 'test-plans' ? m.nav_test_plans() : m.nav_test_runs()}</Button
					>
				{/if}
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
