<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { toast } from 'svelte-sonner';
	import * as m from '$lib/paraglide/messages.js';

	let {
		open = $bindable(false),
		projectId,
		onimported
	}: {
		open: boolean;
		projectId: number;
		onimported?: () => void;
	} = $props();

	type RowResult = { row: number; status: 'success' | 'skipped' | 'error'; title?: string; key?: string; error?: string };

	let fileInput: HTMLInputElement | undefined = $state();
	let selectedFile: File | null = $state(null);
	let preview: { headers: string[]; rows: string[][] } | null = $state(null);
	let importing = $state(false);
	let importResult: { imported: number; rows: RowResult[] } | null = $state(null);

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
			// CSV preview
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

		importing = true;
		try {
			const formData = new FormData();
			formData.append('file', selectedFile);

			const res = await fetch(`/api/projects/${projectId}/test-cases/import`, {
				method: 'POST',
				body: formData
			});

			const result = await res.json();

			if (res.ok) {
				toast.success(m.tc_import_success({ count: result.imported }));
				importResult = { imported: result.imported, rows: result.rows ?? [] };
				onimported?.();
			} else {
				if (result.rows && result.rows.length > 0) {
					importResult = { imported: result.imported ?? 0, rows: result.rows };
				} else {
					toast.error(result.errors?.[0] ?? m.tc_import_error());
				}
			}
		} catch {
			toast.error(m.tc_import_error());
		} finally {
			importing = false;
		}
	}

	function resetState() {
		selectedFile = null;
		preview = null;
		importResult = null;
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Portal>
		<Dialog.Overlay />
		<Dialog.Content class="sm:max-w-lg">
			{#if importResult}
				{@const skipped = importResult.rows.filter(r => r.status === 'skipped').length}
				{@const errored = importResult.rows.filter(r => r.status === 'error').length}
				<Dialog.Header>
					<Dialog.Title>{m.tc_import_results()}</Dialog.Title>
					<Dialog.Description>
						{m.tc_import_summary({ imported: importResult.imported, skipped, errors: errored })}
					</Dialog.Description>
				</Dialog.Header>

				<div class="py-4">
					<div class="max-h-64 overflow-auto rounded border">
						<Table.Root>
							<Table.Header>
								<Table.Row>
									<Table.Head class="w-12 text-xs">#</Table.Head>
									<Table.Head class="w-20 text-xs">{m.common_status()}</Table.Head>
									<Table.Head class="text-xs">{m.tc_title_label()}</Table.Head>
								</Table.Row>
							</Table.Header>
							<Table.Body>
								{#each importResult.rows as r (r.row)}
									<Table.Row>
										<Table.Cell class="text-xs text-muted-foreground">{r.row}</Table.Cell>
										<Table.Cell>
											{#if r.status === 'success'}
												<Badge variant="outline" class="text-xs text-green-600">
													{r.key}
												</Badge>
											{:else if r.status === 'skipped'}
												<Badge variant="secondary" class="text-xs">
													Skipped
												</Badge>
											{:else}
												<Badge variant="destructive" class="text-xs">
													Error
												</Badge>
											{/if}
										</Table.Cell>
										<Table.Cell class="text-xs max-w-48 truncate">
											{#if r.status === 'success'}
												{r.title}
											{:else}
												<span class="text-muted-foreground">{r.error}</span>
											{/if}
										</Table.Cell>
									</Table.Row>
								{/each}
							</Table.Body>
						</Table.Root>
					</div>
				</div>

				<Dialog.Footer>
					<Button variant="outline" onclick={() => { resetState(); }}>
						{m.tc_import_new_import()}
					</Button>
					<Button onclick={() => { resetState(); open = false; }}>
						{m.common_close()}
					</Button>
				</Dialog.Footer>
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
							<span class="text-muted-foreground ml-2 text-sm">{selectedFile.name}</span>
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
					<Button variant="outline" onclick={() => { resetState(); open = false; }}>
						{m.common_cancel()}
					</Button>
					<Button onclick={doImport} disabled={!selectedFile || importing}>
						{#if importing}
							{m.common_saving()}
						{:else}
							{m.tc_import()}
						{/if}
					</Button>
				</Dialog.Footer>
			{/if}
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
