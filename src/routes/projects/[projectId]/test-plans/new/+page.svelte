<script lang="ts">
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import PriorityBadge from '$lib/components/PriorityBadge.svelte';
	import VirtualList from '$lib/components/VirtualList.svelte';
	import * as m from '$lib/paraglide/messages.js';
	import { apiPost } from '$lib/api-client';

	let { data } = $props();

	let name = $state('');
	let description = $state('');
	let milestone = $state('');
	let startDate = $state('');
	let endDate = $state('');
	let selectedIds = $state<Set<number>>(new Set());
	let searchFilter = $state('');
	let priorityFilter = $state('');
	let creating = $state(false);

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

	function getPriorityColor(pName: string): string {
		return data.projectPriorities.find((p) => p.name === pName)?.color ?? '#6b7280';
	}

	async function handleCreate() {
		if (!name.trim()) return;
		creating = true;
		try {
			const result = await apiPost<{ id: number }>(`/api/projects/${data.project.id}/test-plans`, {
				name,
				description: description || undefined,
				milestone: milestone || undefined,
				startDate: startDate || undefined,
				endDate: endDate || undefined,
				testCaseIds: [...selectedIds]
			});
			toast.success(m.tp_created());
			goto(`/projects/${data.project.id}/test-plans/${result.id}`);
		} catch {
			// error toast handled by apiPost
		} finally {
			creating = false;
		}
	}
</script>

<div class="mx-auto max-w-3xl">
	<div class="mb-4">
		<a
			href="/projects/{data.project.id}/test-plans"
			class="text-muted-foreground hover:text-foreground text-sm">&larr; {m.common_back_to({ target: m.tp_title() })}</a
		>
	</div>

	<Card.Root>
		<Card.Header>
			<Card.Title class="text-xl">{m.tp_create()}</Card.Title>
		</Card.Header>
		<Card.Content>
			<div class="space-y-4">
				<div class="grid gap-4 sm:grid-cols-2">
					<div class="space-y-2">
						<Label for="planName">{m.tp_name()}</Label>
						<Input id="planName" bind:value={name} placeholder={m.tp_name()} required />
					</div>
					<div class="space-y-2">
						<Label for="planMilestone">{m.tp_milestone()}</Label>
						<Input id="planMilestone" bind:value={milestone} placeholder={m.tp_milestone()} />
					</div>
				</div>

				<div class="space-y-2">
					<Label for="planDesc">{m.tp_desc()}</Label>
					<Textarea id="planDesc" bind:value={description} rows={3} />
				</div>

				<div class="grid gap-4 sm:grid-cols-2">
					<div class="space-y-2">
						<Label for="planStartDate">{m.tp_start_date()}</Label>
						<Input id="planStartDate" type="date" bind:value={startDate} />
					</div>
					<div class="space-y-2">
						<Label for="planEndDate">{m.tp_end_date()}</Label>
						<Input id="planEndDate" type="date" bind:value={endDate} />
					</div>
				</div>

				<!-- Test Case Selection -->
				<div class="space-y-3">
					<div class="flex items-center justify-between">
						<Label>{m.tp_select_cases()} ({selectedIds.size})</Label>
					</div>

					<div class="flex flex-wrap items-center gap-2">
						<Input
							placeholder={m.tr_filter_placeholder()}
							class="max-w-xs"
							bind:value={searchFilter}
						/>
						<div class="flex gap-1">
							<Button
								type="button"
								variant={priorityFilter === '' ? 'default' : 'outline'}
								size="sm"
								onclick={() => (priorityFilter = '')}
							>
								{m.common_all()}
							</Button>
							{#each data.projectPriorities as p (p.id)}
								<Button
									type="button"
									variant={priorityFilter === p.name ? 'default' : 'outline'}
									size="sm"
									onclick={() => (priorityFilter = p.name)}
								>
									{p.name}
								</Button>
							{/each}
						</div>
					</div>

					{#if data.testCases.length === 0}
						<p class="text-muted-foreground text-sm">{m.tr_no_cases()}</p>
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
										<Table.Head class="w-28">{m.common_key()}</Table.Head>
										<Table.Head>{m.common_title()}</Table.Head>
										<Table.Head class="w-28">{m.common_priority()}</Table.Head>
									</Table.Row>
								</Table.Header>
							</Table.Root>
							<VirtualList items={filteredCases} rowHeight={44} height="420px">
								{#snippet children({ item })}
									{@const tc = item as typeof filteredCases[0]}
									<Table.Root>
										<Table.Body>
											<Table.Row
												class="cursor-pointer"
												onclick={() => toggleCase(tc.id)}
											>
												<Table.Cell class="w-10">
													<input
														type="checkbox"
														checked={selectedIds.has(tc.id)}
														onchange={() => toggleCase(tc.id)}
														onclick={(e: MouseEvent) => e.stopPropagation()}
														class="rounded"
													/>
												</Table.Cell>
												<Table.Cell class="w-28 font-mono text-sm">{tc.key}</Table.Cell>
												<Table.Cell class="font-medium">{tc.title}</Table.Cell>
												<Table.Cell class="w-28">
													<PriorityBadge name={tc.priority} color={getPriorityColor(tc.priority)} />
												</Table.Cell>
											</Table.Row>
										</Table.Body>
									</Table.Root>
								{/snippet}
							</VirtualList>
						</Card.Root>
					{/if}
				</div>

				<div class="flex gap-3 pt-2">
					<Button onclick={handleCreate} disabled={creating || !name.trim()}>
						{creating ? m.common_creating() : m.tp_create()}
					</Button>
					<Button variant="outline" href="/projects/{data.project.id}/test-plans">{m.common_cancel()}</Button>
				</div>
			</div>
		</Card.Content>
	</Card.Root>
</div>
