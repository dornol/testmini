<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';

	let { data } = $props();
	const actionData = $derived(page.form as Record<string, unknown> | null);

	let selectedIds = $state<Set<number>>(new Set());
	let searchFilter = $state('');
	let priorityFilter = $state('');

	const filteredCases = $derived(
		data.testCases.filter((tc) => {
			const matchSearch =
				!searchFilter ||
				tc.title.toLowerCase().includes(searchFilter.toLowerCase()) ||
				tc.key.toLowerCase().includes(searchFilter.toLowerCase());
			const matchPriority = !priorityFilter || tc.priority === priorityFilter;
			return matchSearch && matchPriority;
		})
	);

	const allFilteredSelected = $derived(
		filteredCases.length > 0 && filteredCases.every((tc) => selectedIds.has(tc.id))
	);

	function toggleAll() {
		if (allFilteredSelected) {
			const newSet = new Set(selectedIds);
			filteredCases.forEach((tc) => newSet.delete(tc.id));
			selectedIds = newSet;
		} else {
			const newSet = new Set(selectedIds);
			filteredCases.forEach((tc) => newSet.add(tc.id));
			selectedIds = newSet;
		}
	}

	function toggleCase(id: number) {
		const newSet = new Set(selectedIds);
		if (newSet.has(id)) {
			newSet.delete(id);
		} else {
			newSet.add(id);
		}
		selectedIds = newSet;
	}

	function priorityVariant(
		p: string
	): 'default' | 'secondary' | 'outline' | 'destructive' {
		switch (p) {
			case 'CRITICAL':
				return 'destructive';
			case 'HIGH':
				return 'default';
			case 'MEDIUM':
				return 'secondary';
			default:
				return 'outline';
		}
	}

	const environments = ['DEV', 'QA', 'STAGE', 'PROD'];
	const priorities = ['', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
</script>

<div class="mx-auto max-w-3xl">
	<div class="mb-6">
		<a
			href="/projects/{data.project.id}/test-runs"
			class="text-muted-foreground hover:text-foreground text-sm">&larr; Back to Test Runs</a
		>
	</div>

	<Card.Root>
		<Card.Header>
			<Card.Title class="text-2xl">New Test Run</Card.Title>
			<Card.Description>Configure a test run and select test cases to execute</Card.Description>
		</Card.Header>
		<Card.Content>
			<form method="POST" use:enhance class="space-y-6">
				<div class="grid gap-4 sm:grid-cols-2">
					<div class="space-y-2">
						<Label for="name">Run Name</Label>
						<Input id="name" name="name" placeholder="e.g., Sprint 42 Regression" required />
						{#if (actionData?.errors as Record<string, string[]> | undefined)?.name}
							<p class="text-destructive text-sm">{(actionData?.errors as Record<string, string[]>).name}</p>
						{/if}
					</div>
					<div class="space-y-2">
						<Label for="environment">Environment</Label>
						<select
							id="environment"
							name="environment"
							required
							class="border-input bg-background ring-offset-background focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
						>
							{#each environments as env}
								<option value={env}>{env}</option>
							{/each}
						</select>
					</div>
				</div>

				<!-- Test Case Selection -->
				<div class="space-y-3">
					<div class="flex items-center justify-between">
						<Label>Select Test Cases ({selectedIds.size} selected)</Label>
					</div>

					<div class="flex flex-wrap items-center gap-2">
						<Input
							placeholder="Filter by title or key..."
							class="max-w-xs"
							bind:value={searchFilter}
						/>
						<div class="flex gap-1">
							{#each priorities as p (p)}
								<Button
									type="button"
									variant={priorityFilter === p ? 'default' : 'outline'}
									size="sm"
									onclick={() => (priorityFilter = p)}
								>
									{p || 'All'}
								</Button>
							{/each}
						</div>
					</div>

					{#if data.testCases.length === 0}
						<p class="text-muted-foreground text-sm">
							No test cases in this project. Create test cases first.
						</p>
					{:else}
						<Card.Root>
							<Table.Root>
								<Table.Header>
									<Table.Row>
										<Table.Head class="w-10">
											<input
												type="checkbox"
												checked={allFilteredSelected}
												onchange={toggleAll}
												class="rounded"
											/>
										</Table.Head>
										<Table.Head class="w-28">Key</Table.Head>
										<Table.Head>Title</Table.Head>
										<Table.Head class="w-28">Priority</Table.Head>
									</Table.Row>
								</Table.Header>
								<Table.Body>
									{#each filteredCases as tc (tc.id)}
										<Table.Row
											class="cursor-pointer"
											onclick={() => toggleCase(tc.id)}
										>
											<Table.Cell>
												<input
													type="checkbox"
													checked={selectedIds.has(tc.id)}
													onchange={() => toggleCase(tc.id)}
													onclick={(e) => e.stopPropagation()}
													class="rounded"
												/>
											</Table.Cell>
											<Table.Cell class="font-mono text-sm">{tc.key}</Table.Cell>
											<Table.Cell class="font-medium">{tc.title}</Table.Cell>
											<Table.Cell>
												<Badge variant={priorityVariant(tc.priority)}>{tc.priority}</Badge>
											</Table.Cell>
										</Table.Row>
									{/each}
								</Table.Body>
							</Table.Root>
						</Card.Root>
					{/if}

					{#if (actionData?.errors as Record<string, string[]> | undefined)?.testCaseIds}
						<p class="text-destructive text-sm">{(actionData?.errors as Record<string, string[]>).testCaseIds}</p>
					{/if}
				</div>

				<!-- Hidden inputs for selected test case IDs -->
				{#each [...selectedIds] as id (id)}
					<input type="hidden" name="testCaseIds" value={id} />
				{/each}

				<div class="flex gap-3 pt-2">
					<Button type="submit" disabled={selectedIds.size === 0}>
						Create Test Run ({selectedIds.size} cases)
					</Button>
					<Button variant="outline" href="/projects/{data.project.id}/test-runs">Cancel</Button>
				</div>
			</form>
		</Card.Content>
	</Card.Root>
</div>
