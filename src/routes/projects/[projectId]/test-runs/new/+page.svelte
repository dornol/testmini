<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import TagBadge from '$lib/components/TagBadge.svelte';
	import VirtualList from '$lib/components/VirtualList.svelte';
	import * as Select from '$lib/components/ui/select/index.js';
	import * as m from '$lib/paraglide/messages.js';

	let { data } = $props();
	const actionData = $derived(page.form as Record<string, unknown> | null);

	let selectedIds = $state<Set<number>>(new Set(data.preselectedIds ?? []));
	let searchFilter = $state('');
	let priorityFilter = $state('');
	let tagFilter = $state('');
	let selectedEnv = $state('DEV');

	function loadFromSuite(suiteId: string) {
		if (!suiteId) return;
		// Fetch suite items and merge into selection
		fetch(`/api/projects/${data.project.id}/test-suites/${suiteId}`)
			.then((r) => r.json())
			.then((suiteData) => {
				const newSet = new Set(selectedIds);
				for (const item of suiteData.items ?? []) {
					newSet.add(item.testCaseId);
				}
				selectedIds = newSet;
			});
	}

	const filteredCases = $derived(
		data.testCases.filter((tc) => {
			const matchSearch =
				!searchFilter ||
				tc.title.toLowerCase().includes(searchFilter.toLowerCase()) ||
				tc.key.toLowerCase().includes(searchFilter.toLowerCase());
			const matchPriority = !priorityFilter || tc.priority === priorityFilter;
			const matchTag = !tagFilter || tc.tags.some((t) => t.id === Number(tagFilter));
			return matchSearch && matchPriority && matchTag;
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
	<div class="mb-4">
		<a
			href="/projects/{data.project.id}/test-runs"
			class="text-muted-foreground hover:text-foreground text-sm">&larr; {m.common_back_to({ target: m.tr_title() })}</a
		>
	</div>

	<Card.Root>
		<Card.Header>
			<Card.Title class="text-xl">{m.tr_new_title()}</Card.Title>
			<Card.Description>{m.tr_new_desc()}</Card.Description>
		</Card.Header>
		<Card.Content>
			<form method="POST" use:enhance class="space-y-4">
				<div class="grid gap-4 sm:grid-cols-2">
					<div class="space-y-2">
						<Label for="name">{m.tr_run_name()}</Label>
						<Input id="name" name="name" placeholder={m.tr_run_name_placeholder()} required />
						{#if (actionData?.errors as Record<string, string[]> | undefined)?.name}
							<p class="text-destructive text-sm">{(actionData?.errors as Record<string, string[]>).name}</p>
						{/if}
					</div>
					<div class="space-y-2">
						<Label for="environment">{m.common_environment()}</Label>
						<input type="hidden" name="environment" value={selectedEnv} />
						<Select.Root
							type="single"
							value={selectedEnv}
							onValueChange={(v: string) => { selectedEnv = v; }}
						>
							<Select.Trigger class="w-full">
								{selectedEnv}
							</Select.Trigger>
							<Select.Content>
								{#each environments as env}
									<Select.Item value={env} label={env} />
								{/each}
							</Select.Content>
						</Select.Root>
					</div>
				</div>

				<!-- Test Case Selection -->
				<div class="space-y-3">
					<div class="flex items-center justify-between">
						<Label>{m.tr_select_cases({ count: selectedIds.size })}</Label>
					</div>

					{#if data.suites.length > 0}
						<div class="flex items-center gap-2">
							<Label class="text-sm whitespace-nowrap">{m.tr_load_suite()}:</Label>
							<Select.Root
								type="single"
								onValueChange={(v: string) => { loadFromSuite(v); }}
							>
								<Select.Trigger class="w-60">
									{m.tr_load_suite()}
								</Select.Trigger>
								<Select.Content>
									{#each data.suites as suite}
										<Select.Item value={String(suite.id)} label="{suite.name} ({suite.itemCount})" />
									{/each}
								</Select.Content>
							</Select.Root>
						</div>
					{/if}

					<div class="flex flex-wrap items-center gap-2">
						<Input
							placeholder={m.tr_filter_placeholder()}
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
									{p || m.common_all()}
								</Button>
							{/each}
						</div>
						{#if data.projectTags.length > 0}
							<div class="flex gap-1">
								<Button
									type="button"
									variant={!tagFilter ? 'default' : 'outline'}
									size="sm"
									onclick={() => (tagFilter = '')}
								>
									{m.common_all()}
								</Button>
								{#each data.projectTags as t (t.id)}
									<Button
										type="button"
										variant={tagFilter === String(t.id) ? 'default' : 'outline'}
										size="sm"
										onclick={() => (tagFilter = String(t.id))}
									>
										<span class="mr-1.5 inline-block h-2 w-2 rounded-full" style="background-color: {t.color}"></span>
										{t.name}
									</Button>
								{/each}
							</div>
						{/if}
					</div>

					{#if data.testCases.length === 0}
						<p class="text-muted-foreground text-sm">
							{m.tr_no_cases()}
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
													<Badge variant={priorityVariant(tc.priority)}>{tc.priority}</Badge>
												</Table.Cell>
											</Table.Row>
										</Table.Body>
									</Table.Root>
								{/snippet}
							</VirtualList>
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
						{m.tr_create_run({ count: selectedIds.size })}
					</Button>
					<Button variant="outline" href="/projects/{data.project.id}/test-runs">{m.common_cancel()}</Button>
				</div>
			</form>
		</Card.Content>
	</Card.Root>
</div>
