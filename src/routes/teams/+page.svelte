<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';

	let { data } = $props();
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<h1 class="text-xl font-bold">{m.team_title()}</h1>
		<Button href="/teams/new">{m.team_new()}</Button>
	</div>

	{#if data.teams.length === 0}
		<div class="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
			<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground mb-4">
				<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
				<circle cx="9" cy="7" r="4" />
				<path d="M22 21v-2a4 4 0 0 0-3-3.87" />
				<path d="M16 3.13a4 4 0 0 1 0 7.75" />
			</svg>
			<h3 class="text-lg font-semibold">{m.team_empty_title()}</h3>
			<p class="text-muted-foreground mt-1 text-sm">{m.team_empty_create()}</p>
			<Button href="/teams/new" class="mt-4">{m.team_create()}</Button>
		</div>
	{:else}
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{#each data.teams as t (t.id)}
				<a href="/teams/{t.id}" class="block">
					<Card.Root class="transition-shadow hover:shadow-md">
						<Card.Header>
							<Card.Title class="text-lg">{t.name}</Card.Title>
							{#if t.description}
								<Card.Description class="line-clamp-2">{t.description}</Card.Description>
							{/if}
						</Card.Header>
						<Card.Footer class="text-muted-foreground text-sm">
							<div class="flex items-center gap-4">
								<span class="flex items-center gap-1">
									<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
										<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
										<circle cx="9" cy="7" r="4" />
										<path d="M22 21v-2a4 4 0 0 0-3-3.87" />
										<path d="M16 3.13a4 4 0 0 1 0 7.75" />
									</svg>
									{m.team_members()}: {t.memberCount}
								</span>
								<span class="flex items-center gap-1">
									<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
										<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
									</svg>
									{m.team_projects()}: {t.projectCount}
								</span>
							</div>
						</Card.Footer>
					</Card.Root>
				</a>
			{/each}
		</div>
	{/if}
</div>
