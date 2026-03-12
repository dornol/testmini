<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import PriorityBadge from '$lib/components/PriorityBadge.svelte';
	import * as m from '$lib/paraglide/messages.js';

	interface VersionEntry {
		id: number;
		versionNo: number;
		title: string;
		priority: string;
		updatedBy: string;
		createdAt: string | Date;
	}

	interface PriorityDef {
		id: number;
		name: string;
		color: string;
	}

	interface Props {
		versions: VersionEntry[];
		currentVersionId: number | undefined;
		projectPriorities: PriorityDef[];
	}

	let { versions, currentVersionId, projectPriorities }: Props = $props();

	function getPriorityColor(name: string): string {
		return projectPriorities.find((p) => p.name === name)?.color ?? '#6b7280';
	}
</script>

<Card.Root class="h-fit">
	<Card.Header>
		<Card.Title class="text-base">{m.tc_detail_version_history()}</Card.Title>
	</Card.Header>
	<Card.Content>
		{#if versions.length === 0}
			<p class="text-muted-foreground text-sm">{m.tc_detail_no_versions()}</p>
		{:else}
			<div class="space-y-3">
				{#each versions as v (v.id)}
					<div
						class="rounded-md border p-3 {v.id === currentVersionId
							? 'border-primary bg-primary/5'
							: ''}"
					>
						<div class="flex items-center justify-between">
							<span class="text-sm font-medium">v{v.versionNo}</span>
							<PriorityBadge name={v.priority} color={getPriorityColor(v.priority)} />
						</div>
						<p class="mt-1 text-sm">{v.title}</p>
						<div class="text-muted-foreground mt-1 text-xs">
							{v.updatedBy} &middot; {new Date(v.createdAt).toLocaleDateString()}
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</Card.Content>
</Card.Root>
