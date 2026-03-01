<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';

	let { data } = $props();
	const proj = $derived(data.project);
</script>

<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
	<Card.Root>
		<Card.Header>
			<Card.Title class="text-sm font-medium">Status</Card.Title>
		</Card.Header>
		<Card.Content>
			<Badge variant={proj.active ? 'default' : 'secondary'}>
				{proj.active ? 'Active' : 'Inactive'}
			</Badge>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title class="text-sm font-medium">Members</Card.Title>
		</Card.Header>
		<Card.Content>
			<p class="text-2xl font-bold">{proj.memberCount}</p>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title class="text-sm font-medium">Created</Card.Title>
		</Card.Header>
		<Card.Content>
			<p class="text-2xl font-bold">{new Date(proj.createdAt).toLocaleDateString()}</p>
		</Card.Content>
	</Card.Root>
</div>

{#if proj.description}
	<Card.Root class="mt-6">
		<Card.Header>
			<Card.Title class="text-sm font-medium">Description</Card.Title>
		</Card.Header>
		<Card.Content>
			<p class="text-muted-foreground whitespace-pre-wrap">{proj.description}</p>
		</Card.Content>
	</Card.Root>
{/if}
