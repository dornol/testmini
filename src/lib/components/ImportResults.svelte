<script lang="ts">
	import * as Table from '$lib/components/ui/table/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import * as m from '$lib/paraglide/messages.js';

	type RowResult = {
		row: number;
		status: 'success' | 'skipped' | 'error';
		title?: string;
		key?: string;
		error?: string;
	};

	let {
		importResult,
		onreset,
		onclose
	}: {
		importResult: { imported: number; rows: RowResult[] };
		onreset: () => void;
		onclose: () => void;
	} = $props();

	let failedRowsExpanded = $state(false);

	const failedRows = $derived(
		importResult.rows.filter((r) => r.status === 'error' || r.status === 'skipped')
	);
	const successCount = $derived(importResult.rows.filter((r) => r.status === 'success').length);
	const totalCount = $derived(importResult.rows.length);
	const successRatio = $derived(totalCount > 0 ? (successCount / totalCount) * 100 : 0);
	const skippedCount = $derived(importResult.rows.filter((r) => r.status === 'skipped').length);
	const errorCount = $derived(importResult.rows.filter((r) => r.status === 'error').length);
	const allSucceeded = $derived(
		importResult.rows.length > 0 && importResult.rows.every((r) => r.status === 'success')
	);
</script>

<div class="space-y-4 py-4">
	<div class="space-y-3 rounded-lg border bg-card p-4">
		<div class="flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
			<span class="text-muted-foreground">{m.tc_import_rows_total({ total: totalCount })}</span>
			<div class="flex flex-wrap items-center gap-x-3 gap-y-1">
				<span class="font-medium text-green-600"
					>{m.tc_import_rows_success({ count: successCount })}</span
				>
				{#if errorCount > 0}
					<span class="font-medium text-destructive"
						>{m.tc_import_rows_failed({ count: errorCount })}</span
					>
				{/if}
				{#if skippedCount > 0}
					<span class="text-muted-foreground"
						>{m.tc_import_rows_skipped({ count: skippedCount })}</span
					>
				{/if}
			</div>
		</div>

		<div class="h-2 w-full overflow-hidden rounded-full bg-secondary">
			<div
				class="h-full rounded-full bg-green-500 transition-all duration-500"
				style="width: {successRatio}%"
			></div>
		</div>

		{#if allSucceeded}
			<p class="text-xs font-medium text-green-600">{m.tc_import_all_success()}</p>
		{:else if errorCount > 0}
			<p class="text-xs text-muted-foreground">{m.tc_import_partial_success()}</p>
		{/if}
	</div>

	{#if failedRows.length > 0}
		<div class="rounded-lg border">
			<button
				type="button"
				class="flex w-full items-center justify-between gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors hover:bg-accent"
				onclick={() => {
					failedRowsExpanded = !failedRowsExpanded;
				}}
			>
				<span class="flex min-w-0 items-center gap-2">
					<svg
						class="h-4 w-4 shrink-0 text-destructive"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
						aria-hidden="true"
					>
						<circle cx="12" cy="12" r="10"></circle>
						<line x1="12" y1="8" x2="12" y2="12"></line>
						<line x1="12" y1="16" x2="12.01" y2="16"></line>
					</svg>
					<span class="truncate">{m.tc_import_failed_rows()} ({failedRows.length})</span>
				</span>
				<svg
					class="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 {failedRowsExpanded
						? 'rotate-180'
						: ''}"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="2"
					aria-hidden="true"
				>
					<polyline points="6 9 12 15 18 9"></polyline>
				</svg>
			</button>

			{#if failedRowsExpanded}
				<div class="max-h-48 overflow-auto border-t">
					<div class="space-y-2 p-2 sm:hidden">
						{#each failedRows as r (r.row)}
							<div class="rounded-md border bg-muted/20 p-2 text-xs">
								<div class="mb-1 flex items-center justify-between gap-2">
									<span class="shrink-0 font-medium text-muted-foreground">#{r.row}</span>
									{#if r.status === 'skipped'}
										<Badge variant="secondary" class="shrink-0 text-xs">Skipped</Badge>
									{:else}
										<Badge variant="destructive" class="shrink-0 text-xs">Error</Badge>
									{/if}
								</div>
								<p
									class="whitespace-pre-wrap break-words text-muted-foreground [overflow-wrap:anywhere]"
								>
									{r.error}
								</p>
							</div>
						{/each}
					</div>
					<Table.Root class="hidden sm:table">
						<Table.Header>
							<Table.Row>
								<Table.Head class="w-12 text-xs">#</Table.Head>
								<Table.Head class="w-20 text-xs">{m.common_status()}</Table.Head>
								<Table.Head class="text-xs">{m.tc_title_label()}</Table.Head>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each failedRows as r (r.row)}
								<Table.Row>
									<Table.Cell class="text-xs text-muted-foreground">{r.row}</Table.Cell>
									<Table.Cell>
										{#if r.status === 'skipped'}
											<Badge variant="secondary" class="text-xs">Skipped</Badge>
										{:else}
											<Badge variant="destructive" class="text-xs">Error</Badge>
										{/if}
									</Table.Cell>
									<Table.Cell class="max-w-48 text-xs">
										<div class="truncate text-muted-foreground" title={r.error ?? ''}>
											{r.error}
										</div>
									</Table.Cell>
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
				</div>
			{/if}
		</div>
	{/if}

	{#if allSucceeded}
		<p class="text-center text-xs text-muted-foreground">Closing automatically in 3 seconds...</p>
	{/if}
</div>

<div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
	<Button variant="outline" onclick={onreset} class="w-full sm:w-auto">
		{m.tc_import_new_import()}
	</Button>
	<Button onclick={onclose} class="w-full sm:w-auto">
		{m.common_close()}
	</Button>
</div>
