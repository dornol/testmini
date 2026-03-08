<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { toast } from 'svelte-sonner';
	import { apiPost, apiPatch, apiDelete } from '$lib/api-client';
	import * as m from '$lib/paraglide/messages.js';

	interface Parameter {
		id: number;
		testCaseId: number;
		name: string;
		orderIndex: number;
	}

	interface DataSet {
		id: number;
		testCaseId: number;
		name: string | null;
		values: Record<string, string>;
		orderIndex: number;
	}

	let {
		projectId,
		testCaseId,
		parameters: initialParameters,
		dataSets: initialDataSets,
		editable
	}: {
		projectId: number;
		testCaseId: number;
		parameters: Parameter[];
		dataSets: DataSet[];
		editable: boolean;
	} = $props();

	let parameters = $state<Parameter[]>([]);
	let dataSets = $state<DataSet[]>([]);
	let newParamName = $state('');
	let addingParam = $state(false);
	let addingRow = $state(false);
	let editingParamId = $state<number | null>(null);
	let editingParamName = $state('');
	let importingCsv = $state(false);

	// Sync from props when they change (e.g., page navigation)
	$effect(() => {
		parameters = [...initialParameters];
	});
	$effect(() => {
		dataSets = [...initialDataSets];
	});

	const apiBase = $derived(`/api/projects/${projectId}/test-cases/${testCaseId}`);

	async function addParameter() {
		if (!newParamName.trim() || addingParam) return;
		addingParam = true;
		try {
			const param = await apiPost<Parameter>(`${apiBase}/parameters`, { name: newParamName.trim() });
			parameters = [...parameters, param];
			newParamName = '';
			toast.success(m.param_added());
		} catch {
			// handled by apiPost
		} finally {
			addingParam = false;
		}
	}

	async function removeParameter(id: number) {
		try {
			await apiDelete(`${apiBase}/parameters/${id}`);
			const removedParam = parameters.find((p) => p.id === id);
			parameters = parameters.filter((p) => p.id !== id);
			if (removedParam) {
				dataSets = dataSets.map((ds) => {
					const newValues = { ...ds.values };
					delete newValues[removedParam.name];
					return { ...ds, values: newValues };
				});
			}
			toast.success(m.param_removed());
		} catch {
			// handled
		}
	}

	function startEditParam(p: Parameter) {
		editingParamId = p.id;
		editingParamName = p.name;
	}

	async function saveEditParam() {
		if (!editingParamId || !editingParamName.trim()) return;
		try {
			await apiPatch(`${apiBase}/parameters/${editingParamId}`, { name: editingParamName.trim() });
			const oldParam = parameters.find((p) => p.id === editingParamId);
			const oldName = oldParam?.name;
			parameters = parameters.map((p) =>
				p.id === editingParamId ? { ...p, name: editingParamName.trim() } : p
			);
			if (oldName && oldName !== editingParamName.trim()) {
				dataSets = dataSets.map((ds) => {
					const newValues = { ...ds.values };
					if (oldName in newValues) {
						newValues[editingParamName.trim()] = newValues[oldName];
						delete newValues[oldName];
					}
					return { ...ds, values: newValues };
				});
			}
			editingParamId = null;
			editingParamName = '';
		} catch {
			// handled
		}
	}

	async function addDataRow() {
		if (addingRow || parameters.length === 0) return;
		addingRow = true;
		try {
			const values: Record<string, string> = {};
			for (const p of parameters) {
				values[p.name] = '';
			}
			const ds = await apiPost<DataSet>(`${apiBase}/datasets`, { values });
			dataSets = [...dataSets, ds];
		} catch {
			// handled
		} finally {
			addingRow = false;
		}
	}

	async function updateDataCell(dsId: number, paramName: string, value: string) {
		const ds = dataSets.find((d) => d.id === dsId);
		if (!ds) return;
		const newValues = { ...ds.values, [paramName]: value };
		dataSets = dataSets.map((d) => (d.id === dsId ? { ...d, values: newValues } : d));
		try {
			await apiPatch(`${apiBase}/datasets/${dsId}`, { values: newValues });
		} catch {
			dataSets = dataSets.map((d) => (d.id === dsId ? ds : d));
		}
	}

	async function updateDataSetName(dsId: number, name: string) {
		try {
			await apiPatch(`${apiBase}/datasets/${dsId}`, { name: name || null });
			dataSets = dataSets.map((d) => (d.id === dsId ? { ...d, name: name || null } : d));
		} catch {
			// handled
		}
	}

	async function removeDataRow(dsId: number) {
		try {
			await apiDelete(`${apiBase}/datasets/${dsId}`);
			dataSets = dataSets.filter((d) => d.id !== dsId);
			toast.success(m.dataset_removed());
		} catch {
			// handled
		}
	}

	async function handleCsvImport(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		importingCsv = true;
		try {
			const formData = new FormData();
			formData.append('file', file);
			const res = await fetch(`${apiBase}/datasets/import`, {
				method: 'POST',
				body: formData
			});
			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				toast.error(err.error || 'Import failed');
				return;
			}
			const result = await res.json();
			toast.success(m.dataset_imported({ count: String(result.imported) }));
			const [pRes, dRes] = await Promise.all([
				fetch(`${apiBase}/parameters`),
				fetch(`${apiBase}/datasets`)
			]);
			if (pRes.ok) parameters = await pRes.json();
			if (dRes.ok) dataSets = await dRes.json();
		} catch {
			toast.error(m.dataset_import_failed());
		} finally {
			importingCsv = false;
			input.value = '';
		}
	}
</script>

<Card.Root>
	<Card.Header>
		<div class="flex items-center justify-between">
			<Card.Title class="text-base">{m.param_title()}</Card.Title>
			{#if editable && parameters.length > 0}
				<div class="flex gap-2">
					<label class="cursor-pointer">
						<input
							type="file"
							accept=".csv"
							class="hidden"
							onchange={handleCsvImport}
							disabled={importingCsv}
						/>
						<Button variant="outline" size="sm" onclick={(e: MouseEvent) => {
							const label = (e.currentTarget as HTMLElement).closest('label');
							label?.querySelector('input')?.click();
						}}>
							{importingCsv ? m.common_loading() : m.dataset_import_csv()}
						</Button>
					</label>
				</div>
			{/if}
		</div>
	</Card.Header>
	<Card.Content class="space-y-4">
		<!-- Parameters -->
		<div>
			<h4 class="text-sm font-medium mb-2">{m.param_variables()}</h4>
			<div class="flex flex-wrap gap-2 mb-2">
				{#each parameters as p (p.id)}
					{#if editingParamId === p.id}
						<div class="flex items-center gap-1">
							<Input
								class="h-7 w-32 text-xs"
								bind:value={editingParamName}
								onkeydown={(e: KeyboardEvent) => {
									if (e.key === 'Enter') saveEditParam();
									if (e.key === 'Escape') { editingParamId = null; }
								}}
								autofocus
							/>
							<Button variant="ghost" size="sm" class="h-7 px-1" onclick={saveEditParam}>
								<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
							</Button>
						</div>
					{:else}
						<Badge variant="secondary" class="gap-1 font-mono text-xs">
							<button
								type="button"
								class="cursor-pointer bg-transparent border-0 p-0 font-inherit text-inherit"
								onclick={() => editable && startEditParam(p)}
							>
								{`{{${p.name}}}`}
							</button>
							{#if editable}
								<button
									type="button"
									class="text-muted-foreground hover:text-foreground ml-0.5"
									onclick={() => removeParameter(p.id)}
								>&times;</button>
							{/if}
						</Badge>
					{/if}
				{/each}
				{#if editable}
					<form
						class="flex items-center gap-1"
						onsubmit={(e) => { e.preventDefault(); addParameter(); }}
					>
						<Input
							class="h-7 w-32 text-xs"
							placeholder={m.param_name_placeholder()}
							bind:value={newParamName}
						/>
						<Button variant="outline" size="sm" class="h-7 px-2 text-xs" type="submit" disabled={addingParam || !newParamName.trim()}>
							+
						</Button>
					</form>
				{/if}
			</div>
		</div>

		<!-- Data Sets Table -->
		{#if parameters.length > 0}
			<div>
				<div class="flex items-center justify-between mb-2">
					<h4 class="text-sm font-medium">{m.dataset_title()}</h4>
					{#if editable}
						<Button variant="outline" size="sm" onclick={addDataRow} disabled={addingRow}>
							{m.dataset_add_row()}
						</Button>
					{/if}
				</div>

				{#if dataSets.length === 0}
					<p class="text-muted-foreground text-sm">{m.dataset_empty()}</p>
				{:else}
					<div class="overflow-x-auto border rounded-md">
						<table class="w-full text-sm">
							<thead>
								<tr class="border-b bg-muted/50">
									<th class="px-3 py-2 text-left text-xs font-medium text-muted-foreground w-24">{m.dataset_label()}</th>
									{#each parameters as p (p.id)}
										<th class="px-3 py-2 text-left text-xs font-medium font-mono">{p.name}</th>
									{/each}
									{#if editable}
										<th class="px-3 py-2 w-10"></th>
									{/if}
								</tr>
							</thead>
							<tbody>
								{#each dataSets as ds, i (ds.id)}
									<tr class="border-b last:border-b-0">
										<td class="px-3 py-1.5">
											{#if editable}
												<Input
													class="h-7 text-xs border-0 bg-transparent px-0"
													value={ds.name ?? ''}
													placeholder={`#${i + 1}`}
													onblur={(e: FocusEvent) => updateDataSetName(ds.id, (e.target as HTMLInputElement).value)}
												/>
											{:else}
												<span class="text-xs text-muted-foreground">{ds.name || `#${i + 1}`}</span>
											{/if}
										</td>
										{#each parameters as p (p.id)}
											<td class="px-3 py-1.5">
												{#if editable}
													<Input
														class="h-7 text-xs border-0 bg-transparent px-0"
														value={ds.values[p.name] ?? ''}
														onblur={(e: FocusEvent) => updateDataCell(ds.id, p.name, (e.target as HTMLInputElement).value)}
													/>
												{:else}
													<span class="text-xs">{ds.values[p.name] ?? ''}</span>
												{/if}
											</td>
										{/each}
										{#if editable}
											<td class="px-3 py-1.5">
												<button
													type="button"
													class="text-muted-foreground hover:text-destructive text-xs"
													onclick={() => removeDataRow(ds.id)}
												>&times;</button>
											</td>
										{/if}
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</div>
		{:else if !editable}
			<p class="text-muted-foreground text-sm">{m.param_empty()}</p>
		{/if}
	</Card.Content>
</Card.Root>
