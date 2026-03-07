<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { toast } from 'svelte-sonner';
	import * as m from '$lib/paraglide/messages.js';
	import ImportResults from './ImportResults.svelte';

	let {
		open = $bindable(false),
		projectId,
		onimported
	}: {
		open: boolean;
		projectId: number;
		onimported?: () => void;
	} = $props();

	type ImportStatus = 'idle' | 'uploading' | 'processing' | 'complete' | 'error';
	type RowResult = { row: number; status: 'success' | 'skipped' | 'error'; title?: string; key?: string; error?: string };

	let fileInput: HTMLInputElement | undefined = $state();
	let selectedFile: File | null = $state(null);
	let preview: { headers: string[]; rows: string[][] } | null = $state(null);
	// eslint-disable-next-line prefer-const
	let importStatus = $state<ImportStatus>('idle');
	// eslint-disable-next-line prefer-const
	let importResult = $state<{ imported: number; rows: RowResult[] } | null>(null);
	let autoCloseTimeout: ReturnType<typeof setTimeout> | undefined;

	let importing = $derived(importStatus === 'uploading' || importStatus === 'processing');

	async function handleFileChange(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0] ?? null;
		selectedFile = file;
		preview = null;

		if (!file) return;

		const text = await file.text();
		const clean = text.startsWith('\uFEFF') ? text.slice(1) : text;

		if (file.name.endsWith('.json')) {
			try {
				const data = JSON.parse(clean);
				const arr = Array.isArray(data) ? data : data.testCases;
				if (Array.isArray(arr) && arr.length > 0) {
					const headers = Object.keys(arr[0]);
					const rows = arr.slice(0, 5).map((item: Record<string, unknown>) =>
						headers.map((h) => {
							const val = item[h];
							return typeof val === 'object' ? JSON.stringify(val) : String(val ?? '');
						})
					);
					preview = { headers, rows };
				}
			} catch {
				// ignore parse errors for preview
			}
		} else {
			const lines = clean.split('\n').filter((l) => l.trim());
			if (lines.length >= 2) {
				const headers = parseCSVLine(lines[0]);
				const rows = lines.slice(1, 6).map((l) => parseCSVLine(l));
				preview = { headers, rows };
			}
		}
	}

	function parseCSVLine(line: string): string[] {
		const cells: string[] = [];
		let current = '';
		let inQuotes = false;
		for (let i = 0; i < line.length; i++) {
			const ch = line[i];
			if (inQuotes) {
				if (ch === '"') {
					if (i + 1 < line.length && line[i + 1] === '"') {
						current += '"';
						i++;
					} else {
						inQuotes = false;
					}
				} else {
					current += ch;
				}
			} else if (ch === '"') {
				inQuotes = true;
			} else if (ch === ',') {
				cells.push(current);
				current = '';
			} else if (ch !== '\r') {
				current += ch;
			}
		}
		cells.push(current);
		return cells;
	}

	async function doImport() {
		if (!selectedFile) {
			toast.error(m.tc_import_no_file());
			return;
		}

		importStatus = 'uploading';
		try {
			const formData = new FormData();
			formData.append('file', selectedFile);

			importStatus = 'processing';
			const res = await fetch(`/api/projects/${projectId}/test-cases/import`, {
				method: 'POST',
				body: formData
			});

			const result = await res.json();

			if (res.ok || (result.rows && result.rows.length > 0)) {
				importResult = { imported: result.imported ?? 0, rows: result.rows ?? [] };
				importStatus = 'complete';
				onimported?.();

				const allSucceeded =
					importResult.rows.length > 0 && importResult.rows.every((r) => r.status === 'success');
				if (allSucceeded) {
					toast.success(m.tc_import_success({ count: importResult.imported }));
					autoCloseTimeout = setTimeout(() => {
						resetState();
						open = false;
					}, 3000);
				}
			} else {
				importStatus = 'error';
				toast.error(result.errors?.[0] ?? m.tc_import_error());
			}
		} catch {
			importStatus = 'error';
			toast.error(m.tc_import_error());
		}
	}

	function resetState() {
		if (autoCloseTimeout !== undefined) {
			clearTimeout(autoCloseTimeout);
			autoCloseTimeout = undefined;
		}
		selectedFile = null;
		preview = null;
		importResult = null;
		importStatus = 'idle';
	}
</script>

<Dialog.Root bind:open onOpenChange={(v) => { if (!v) resetState(); }}>
	<Dialog.Portal>
		<Dialog.Overlay />
		<Dialog.Content class="sm:max-w-lg">
			{#if importing}
				<Dialog.Header>
					<Dialog.Title>{m.tc_import_title()}</Dialog.Title>
					<Dialog.Description>
						{importStatus === 'uploading' ? m.tc_import_uploading() : m.tc_import_processing()}
					</Dialog.Description>
				</Dialog.Header>

				<div class="flex flex-col items-center gap-4 py-8">
					<div class="w-full space-y-2">
						<div class="relative h-2 w-full overflow-hidden rounded-full bg-secondary">
							<div class="progress-indeterminate absolute inset-y-0 w-2/5 rounded-full bg-primary"></div>
						</div>
						<p class="text-center text-sm text-muted-foreground">
							{importStatus === 'uploading' ? m.tc_import_uploading() : m.tc_import_processing()}
						</p>
					</div>
					{#if selectedFile}
						<p class="max-w-xs truncate text-xs text-muted-foreground">{selectedFile.name}</p>
					{/if}
				</div>

			{:else if importStatus === 'complete' && importResult}
				<Dialog.Header>
					<Dialog.Title>{m.tc_import_results()}</Dialog.Title>
					<Dialog.Description>
						{m.tc_import_summary({
							imported: importResult.imported,
							skipped: importResult.rows.filter((r) => r.status === 'skipped').length,
							errors: importResult.rows.filter((r) => r.status === 'error').length
						})}
					</Dialog.Description>
				</Dialog.Header>

				<ImportResults
					{importResult}
					onreset={resetState}
					onclose={() => { resetState(); open = false; }}
				/>

			{:else}
				<Dialog.Header>
					<Dialog.Title>{m.tc_import_title()}</Dialog.Title>
					<Dialog.Description>{m.tc_import_desc()}</Dialog.Description>
				</Dialog.Header>

				<div class="space-y-4 py-4">
					<div>
						<input
							bind:this={fileInput}
							type="file"
							accept=".csv,.json"
							onchange={handleFileChange}
							class="hidden"
						/>
						<Button variant="outline" onclick={() => fileInput?.click()}>
							{m.tc_import_select_file()}
						</Button>
						{#if selectedFile}
							<span class="ml-2 text-sm text-muted-foreground">{selectedFile.name}</span>
						{/if}
					</div>

					{#if preview}
						<div>
							<h4 class="mb-2 text-sm font-medium">{m.tc_import_preview()}</h4>
							<div class="max-h-48 overflow-auto rounded border">
								<Table.Root>
									<Table.Header>
										<Table.Row>
											{#each preview.headers as h (h)}
												<Table.Head class="text-xs">{h}</Table.Head>
											{/each}
										</Table.Row>
									</Table.Header>
									<Table.Body>
										{#each preview.rows as row, i (i)}
											<Table.Row>
												{#each row as cell, j (j)}
													<Table.Cell class="max-w-32 truncate text-xs">{cell}</Table.Cell>
												{/each}
											</Table.Row>
										{/each}
									</Table.Body>
								</Table.Root>
							</div>
						</div>
					{/if}
				</div>

				<Dialog.Footer>
					<Button
						variant="outline"
						onclick={() => {
							resetState();
							open = false;
						}}
					>
						{m.common_cancel()}
					</Button>
					<Button onclick={doImport} disabled={!selectedFile || importing}>
						{m.tc_import()}
					</Button>
				</Dialog.Footer>
			{/if}
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<style>
	.progress-indeterminate {
		animation: indeterminate-progress 1.5s ease-in-out infinite;
	}

	@keyframes indeterminate-progress {
		0% {
			left: -40%;
		}
		60% {
			left: 100%;
		}
		100% {
			left: 100%;
		}
	}
</style>
