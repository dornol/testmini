<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';

	let { data } = $props();

	function roleBadgeVariant(role: string): 'default' | 'secondary' | 'outline' {
		if (role === 'OWNER') return 'default';
		if (role === 'ADMIN') return 'secondary';
		return 'outline';
	}
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<div class="mb-1">
				<a href="/teams" class="text-muted-foreground hover:text-foreground text-sm">&larr; {m.common_back_to({ target: m.nav_teams() })}</a>
			</div>
			<h1 class="text-xl font-bold">{data.team.name}</h1>
			{#if data.team.description}
				<p class="text-muted-foreground mt-1 text-sm">{data.team.description}</p>
			{/if}
		</div>
		{#if data.userTeamRole === 'OWNER' || data.userTeamRole === 'ADMIN'}
			<Button variant="outline" href="/teams/{data.team.id}/settings">{m.team_settings()}</Button>
		{/if}
	</div>

	<!-- Projects Section -->
	<div class="space-y-3">
		<h2 class="text-lg font-semibold">{m.team_projects()}</h2>
		{#if data.teamProjects.length === 0}
			<div class="flex flex-col items-center justify-center rounded-lg border border-dashed p-6 text-center">
				<p class="text-muted-foreground text-sm">{m.team_no_projects()}</p>
			</div>
		{:else}
			<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{#each data.teamProjects as proj (proj.id)}
					<a href="/projects/{proj.id}" class="block">
						<Card.Root class="transition-shadow hover:shadow-md">
							<Card.Header>
								<div class="flex items-start justify-between">
									<Card.Title class="text-lg">{proj.name}</Card.Title>
									{#if !proj.active}
										<Badge variant="secondary">{m.common_inactive()}</Badge>
									{/if}
								</div>
								{#if proj.description}
									<Card.Description class="line-clamp-2">{proj.description}</Card.Description>
								{/if}
							</Card.Header>
							<Card.Footer class="text-muted-foreground text-sm">
								<span class="flex items-center gap-1">
									<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
										<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
										<circle cx="9" cy="7" r="4" />
										<path d="M22 21v-2a4 4 0 0 0-3-3.87" />
										<path d="M16 3.13a4 4 0 0 1 0 7.75" />
									</svg>
									{m.projects_members_count({ count: proj.memberCount })}
								</span>
							</Card.Footer>
						</Card.Root>
					</a>
				{/each}
			</div>
		{/if}
	</div>

	<!-- Members Section -->
	<div class="space-y-3">
		<h2 class="text-lg font-semibold">{m.team_members()}</h2>
		<Card.Root>
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>{m.common_name()}</Table.Head>
						<Table.Head>{m.common_email()}</Table.Head>
						<Table.Head>{m.common_role()}</Table.Head>
						<Table.Head>{m.common_date()}</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.members as member}
						<Table.Row>
							<Table.Cell class="font-medium">{member.userName}</Table.Cell>
							<Table.Cell class="text-muted-foreground">{member.userEmail}</Table.Cell>
							<Table.Cell>
								<Badge variant={roleBadgeVariant(member.role)}>
									{#if member.role === 'OWNER'}
										{m.team_role_owner()}
									{:else if member.role === 'ADMIN'}
										{m.team_role_admin()}
									{:else}
										{m.team_role_member()}
									{/if}
								</Badge>
							</Table.Cell>
							<Table.Cell class="text-muted-foreground">
								{new Date(member.joinedAt).toLocaleDateString()}
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</Card.Root>
	</div>
</div>
