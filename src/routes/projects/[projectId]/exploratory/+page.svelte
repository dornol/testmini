<script lang="ts">
	import { exploratoryElapsedSeconds } from '$lib/exploratory-time';
	import WorkflowCreateDialog from '$lib/components/patterns/WorkflowCreateDialog.svelte';
	import WorkflowField from '$lib/components/patterns/WorkflowField.svelte';
	import { feedbackFor, type FormFeedback } from '$lib/form-feedback';
	import {
		MAX_TITLE_LENGTH,
		MAX_TEXT_LENGTH,
		MAX_ENVIRONMENT_LENGTH,
		MAX_TAGS,
		MAX_TAG_LENGTH
	} from '$lib/exploratory-session-limits';
	import { isInteractiveTarget } from '$lib/utils';
	import PageHeader from '$lib/components/patterns/PageHeader.svelte';
	import StatusFilter from '$lib/components/patterns/StatusFilter.svelte';
	import EmptyState from '$lib/components/patterns/EmptyState.svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import * as m from '$lib/paraglide/messages.js';
	import { toast } from 'svelte-sonner';

	let { data } = $props();

	let showNewDialog = $state(false);
	let newTitle = $state('');
	let newCharter = $state('');
	let newEnvironment = $state('');
	let newTags = $state('');

	const projectId = $derived(data.project.id);
	const canManage = $derived(data.userRole !== 'VIEWER');
	let retrying = $state(false);
	async function retryLoad() {
		retrying = true;
		try {
			await invalidateAll();
		} finally {
			retrying = false;
		}
	}
	const apiBase = $derived(`/api/projects/${projectId}/exploratory-sessions`);

	let statusFilter = $derived(data.statusFilter);

	function setStatusFilter(status: string) {
		const url = new URL(page.url);
		if (status) {
			url.searchParams.set('status', status);
		} else {
			url.searchParams.delete('status');
		}
		goto(url.toString(), { keepFocus: true, noScroll: true });
	}

	function statusVariant(status: string): 'default' | 'secondary' | 'outline' | 'destructive' {
		if (status === 'ACTIVE') return 'default';
		if (status === 'PAUSED') return 'secondary';
		return 'outline';
	}

	function statusLabel(status: string): string {
		if (status === 'ACTIVE') return m.exploratory_status_active();
		if (status === 'PAUSED') return m.exploratory_status_paused();
		return m.exploratory_status_completed();
	}

	function formatDuration(session: {
		startedAt: string | Date;
		pausedDuration: number;
		pausedAt: Date | string | null;
		completedAt: string | Date | null;
		status: string;
	}): string {
		const secs = exploratoryElapsedSeconds(session);
		if (secs === null) return '—';
		const h = Math.floor(secs / 3600);
		const min = Math.floor((secs % 3600) / 60);
		const s = secs % 60;
		if (h > 0) return `${h}h ${min}m`;
		return `${min}m ${s}s`;
	}

	const createFields: Record<string, string> = {
		title: 'session-title',
		charter: 'session-charter',
		environment: 'session-environment',
		tags: 'session-tags'
	};

	function validateSession() {
		const title = newTitle.trim();
		const charter = newCharter.trim();
		const environment = newEnvironment.trim();
		const tags = newTags
			.split(',')
			.map((tag) => tag.trim())
			.filter(Boolean);
		const errors: FormFeedback[] = [];
		if (!title) errors.push({ path: 'title', messages: [m.ui_title_required()] });
		for (const [path, value, max] of [
			['title', title, MAX_TITLE_LENGTH],
			['charter', charter, MAX_TEXT_LENGTH],
			['environment', environment, MAX_ENVIRONMENT_LENGTH]
		] as const) {
			if (value.length > max)
				errors.push({ path, messages: [m.ui_max_characters({ count: max })] });
		}
		const tagMessages: string[] = [];
		if (tags.length > MAX_TAGS) tagMessages.push(m.ui_exploratory_tag_limit({ count: MAX_TAGS }));
		if (tags.some((tag) => tag.length > MAX_TAG_LENGTH))
			tagMessages.push(m.ui_exploratory_tag_length({ count: MAX_TAG_LENGTH }));
		if (tagMessages.length) errors.push({ path: 'tags', messages: tagMessages });
		return errors.length
			? { errors }
			: {
					data: {
						title,
						charter: charter || undefined,
						environment: environment || undefined,
						tags
					}
				};
	}
</script>

<div class="space-y-6">
	<PageHeader title={m.exploratory_title()}>
		{#snippet actions()}{#if canManage}<Button
					class="w-full sm:w-auto"
					onclick={() => (showNewDialog = true)}>{m.exploratory_new()}</Button
				>{/if}{/snippet}
	</PageHeader>
	<StatusFilter
		value={statusFilter}
		onchange={setStatusFilter}
		options={['', 'ACTIVE', 'PAUSED', 'COMPLETED'].map((value) => ({
			value,
			label: value ? statusLabel(value) : m.common_all()
		}))}
	/>

	{#if data.loadFailed}
		<div role="alert" class="rounded-xl border bg-card p-6 text-center">
			<h3 class="font-semibold">{m.ui_load_failed()}</h3>
			<p class="mt-2 text-sm text-muted-foreground">{m.ui_load_failed_description()}</p>
			<Button class="mt-4" variant="outline" disabled={retrying} onclick={retryLoad}
				>{retrying ? m.common_loading() : m.ui_try_again()}</Button
			>
		</div>
	{:else if data.sessions.length === 0}
		<EmptyState
			title={statusFilter ? m.ui_no_filtered_results() : m.exploratory_empty()}
			description={statusFilter ? m.ui_no_filtered_description() : m.exploratory_empty_hint()}
		>
			{#snippet actions()}{#if statusFilter}<Button
						variant="outline"
						onclick={() => setStatusFilter('')}>{m.ui_clear_filters()}</Button
					>{:else if canManage}<Button
						class="w-full sm:w-auto"
						onclick={() => (showNewDialog = true)}>{m.exploratory_new()}</Button
					>{/if}{/snippet}
		</EmptyState>
	{:else}
		<div class="grid gap-3 md:hidden">
			{#each data.sessions as session (session.id)}
				<a
					class="block w-full rounded-md border p-3 text-left transition-colors hover:bg-muted/50"
					href={`/projects/${projectId}/exploratory/${session.id}`}
				>
					<div
						class="flex flex-col gap-2 min-[420px]:flex-row min-[420px]:items-start min-[420px]:justify-between"
					>
						<div class="min-w-0">
							<div class="break-words text-sm font-medium">{session.title}</div>
							{#if session.charter}
								<p class="mt-1 line-clamp-2 text-xs text-muted-foreground">{session.charter}</p>
							{/if}
						</div>
						<Badge variant={statusVariant(session.status)} class="w-fit text-[10px] px-1.5 py-0">
							{statusLabel(session.status)}
						</Badge>
					</div>
					<dl class="mt-3 grid grid-cols-1 gap-2 text-xs min-[360px]:grid-cols-3">
						<div>
							<dt class="text-muted-foreground">{m.exploratory_duration()}</dt>
							<dd class="font-medium">{formatDuration(session)}</dd>
						</div>
						<div>
							<dt class="text-muted-foreground">{m.exploratory_notes()}</dt>
							<dd class="font-medium">{session.noteCount}</dd>
						</div>
						<div>
							<dt class="text-muted-foreground">{m.common_date()}</dt>
							<dd class="font-medium">{new Date(session.startedAt).toLocaleDateString()}</dd>
						</div>
					</dl>
				</a>
			{/each}
		</div>
		<div class="hidden overflow-x-auto rounded-md border md:block">
			<Table.Root class="min-w-[720px] table-fixed">
				<Table.Header>
					<Table.Row>
						<Table.Head class="py-1 px-2 text-xs">{m.common_title()}</Table.Head>
						<Table.Head class="py-1 px-2 text-xs hidden md:table-cell"
							>{m.exploratory_charter()}</Table.Head
						>
						<Table.Head class="w-24 py-1 px-2 text-xs">{m.common_status()}</Table.Head>
						<Table.Head class="w-20 py-1 px-2 text-xs hidden sm:table-cell"
							>{m.exploratory_duration()}</Table.Head
						>
						<Table.Head class="w-16 py-1 px-2 text-xs hidden sm:table-cell"
							>{m.exploratory_notes()}</Table.Head
						>
						<Table.Head class="w-24 py-1 px-2 text-xs hidden lg:table-cell"
							>{m.tr_created_by()}</Table.Head
						>
						<Table.Head class="w-28 py-1 px-2 text-xs hidden lg:table-cell"
							>{m.common_date()}</Table.Head
						>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.sessions as session (session.id)}
						<Table.Row
							class="cursor-pointer hover:bg-muted/50"
							onclick={(event) => {
								if (!isInteractiveTarget(event.target))
									goto(`/projects/${projectId}/exploratory/${session.id}`);
							}}
						>
							<Table.Cell class="min-w-0 py-1 px-2 text-xs font-medium">
								<a
									href={`/projects/${projectId}/exploratory/${session.id}`}
									class="block truncate underline-offset-4 hover:underline"
									title={session.title}>{session.title}</a
								>
								<div class="text-muted-foreground md:hidden text-[10px] truncate max-w-[200px]">
									{session.charter ?? ''}
								</div>
							</Table.Cell>
							<Table.Cell
								class="text-muted-foreground py-1 px-2 text-xs max-w-[200px] truncate hidden md:table-cell"
							>
								{session.charter ?? '-'}
							</Table.Cell>
							<Table.Cell class="py-1 px-2 text-xs">
								<Badge variant={statusVariant(session.status)} class="text-[10px] px-1.5 py-0"
									>{statusLabel(session.status)}</Badge
								>
							</Table.Cell>
							<Table.Cell class="text-muted-foreground py-1 px-2 text-xs hidden sm:table-cell"
								>{formatDuration(session)}</Table.Cell
							>
							<Table.Cell class="text-muted-foreground py-1 px-2 text-xs hidden sm:table-cell"
								>{session.noteCount}</Table.Cell
							>
							<Table.Cell class="text-muted-foreground py-1 px-2 text-xs hidden lg:table-cell">
								<div class="truncate" title={session.createdBy}>{session.createdBy}</div>
							</Table.Cell>
							<Table.Cell class="text-muted-foreground py-1 px-2 text-xs hidden lg:table-cell">
								{new Date(session.startedAt).toLocaleDateString()}
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</div>
		<p class="text-muted-foreground text-sm">{m.common_total_count({ count: data.total })}</p>
	{/if}
</div>

<WorkflowCreateDialog
	bind:open={showNewDialog}
	title={m.exploratory_new()}
	description={m.exploratory_new_desc()}
	submitLabel={m.exploratory_start()}
	endpoint={apiBase}
	fieldTarget={(path) => createFields[path]}
	validate={validateSession}
	onCreated={(id) => {
		toast.success(m.exploratory_created());
		newTitle = '';
		newCharter = '';
		newEnvironment = '';
		newTags = '';
		void goto(`/projects/${projectId}/exploratory/${id}`);
	}}
>
	{#snippet children(errors)}
		<WorkflowField
			id={createFields.title}
			label={m.common_title()}
			error={feedbackFor(errors, 'title')}
			required
		>
			{#snippet children(props)}
				<Input {...props} bind:value={newTitle} placeholder={m.exploratory_title_placeholder()} />
			{/snippet}
		</WorkflowField>
		<WorkflowField
			id={createFields.charter}
			label={m.exploratory_charter()}
			error={feedbackFor(errors, 'charter')}
		>
			{#snippet children(props)}
				<Textarea
					{...props}
					bind:value={newCharter}
					placeholder={m.exploratory_charter_placeholder()}
					rows={3}
				/>
			{/snippet}
		</WorkflowField>
		<WorkflowField
			id={createFields.environment}
			label={m.common_environment()}
			error={feedbackFor(errors, 'environment')}
		>
			{#snippet children(props)}
				<Input
					{...props}
					bind:value={newEnvironment}
					placeholder={m.exploratory_env_placeholder()}
				/>
			{/snippet}
		</WorkflowField>
		<WorkflowField
			id={createFields.tags}
			label={m.exploratory_tags_label()}
			error={feedbackFor(errors, 'tags')}
		>
			{#snippet children(props)}
				<Input {...props} bind:value={newTags} placeholder={m.exploratory_tags_placeholder()} />
			{/snippet}
		</WorkflowField>
	{/snippet}
</WorkflowCreateDialog>
