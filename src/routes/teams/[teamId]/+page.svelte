<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { getLocale } from '$lib/paraglide/runtime';
	import PageHeader from '$lib/components/patterns/PageHeader.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';

	let { data } = $props();
	const canManage = $derived(data.userTeamRole === 'OWNER' || data.userTeamRole === 'ADMIN');
	const settingsLink = $derived('/teams/' + data.team.id + '/settings');
	const roleLabels = {
		OWNER: m.team_role_owner,
		ADMIN: m.team_role_admin,
		MEMBER: m.team_role_member
	};
</script>

{#snippet projectInfo(project: (typeof data.teamProjects)[number])}
	<div class="flex flex-wrap items-start gap-2">
		<h3
			id={`team-project-${project.id}`}
			class="min-w-0 flex-1 font-semibold [overflow-wrap:anywhere]"
		>
			{project.name}
		</h3>
		{#if !project.active}
			<Badge variant="secondary">{m.common_inactive()}</Badge>
		{:else if project.canOpen}
			<ChevronRight class="size-4 shrink-0 self-center text-muted-foreground" aria-hidden="true" />
		{/if}
	</div>
	{#if project.description}
		<p
			class="line-clamp-2 whitespace-pre-line text-sm text-muted-foreground [overflow-wrap:anywhere]"
		>
			{project.description}
		</p>
	{/if}
	<div
		class="mt-auto flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground"
	>
		<span>{m.projects_members_count({ count: project.memberCount })}</span>
		{#if project.active && !project.canOpen}<span>{m.team_project_access_required()}</span>{/if}
	</div>
{/snippet}

<div class="space-y-5">
	<a
		href="/teams"
		class="inline-block rounded-sm text-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
	>
		&larr; {m.common_back_to({ target: m.nav_teams() })}
	</a>
	<PageHeader title={data.team.name} description={data.team.description ?? undefined} level={1}>
		{#snippet actions()}
			{#if canManage}<Button class="w-full sm:w-auto" variant="outline" href={settingsLink}
					>{m.team_settings()}</Button
				>{/if}
		{/snippet}
	</PageHeader>

	<section aria-labelledby="team-projects-heading" class="space-y-3">
		<h2 id="team-projects-heading" class="text-lg font-semibold">
			{m.team_projects()} ({data.teamProjects.length})
		</h2>
		{#if data.teamProjects.length === 0}
			<p class="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
				{m.team_no_projects()}
			</p>
		{:else}
			<ul class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
				{#each data.teamProjects as project (project.id)}
					<li class="min-w-0">
						{#if project.active && project.canOpen}
							<a
								href={'/projects/' + project.id}
								aria-labelledby={`team-project-${project.id}`}
								class="flex h-full min-w-0 flex-col gap-2 rounded-xl border bg-card p-4 hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
							>
								{@render projectInfo(project)}
							</a>
						{:else}
							<div class="flex h-full min-w-0 flex-col gap-2 rounded-xl border bg-card p-4">
								{@render projectInfo(project)}
							</div>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section aria-labelledby="team-members-heading" class="space-y-3">
		<div class="flex flex-wrap items-center justify-between gap-2">
			<h2 id="team-members-heading" class="text-lg font-semibold">
				{m.team_members()} ({data.members.length})
			</h2>
			{#if canManage}<Button href={settingsLink + '/members'} variant="outline" size="sm"
					>{m.team_manage_members()}</Button
				>{/if}
		</div>
		{#if data.members.length === 0}
			<p class="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
				{m.common_no_results()}
			</p>
		{:else}
			<ul class="divide-y rounded-xl border bg-card">
				{#each data.members as member (member.id)}
					<li
						class="flex min-w-0 flex-wrap items-center justify-between gap-3 p-4 [overflow-wrap:anywhere]"
					>
						<div class="min-w-0 basis-full sm:flex-1">
							<p class="font-medium">{member.userName}</p>
							<p class="text-sm text-muted-foreground">{member.userEmail}</p>
						</div>
						<Badge variant={member.role === 'OWNER' ? 'default' : 'secondary'}
							>{roleLabels[member.role]()}</Badge
						>
						<time
							datetime={new Date(member.joinedAt).toISOString()}
							class="text-sm text-muted-foreground"
							>{new Date(member.joinedAt).toLocaleDateString(getLocale(), {
								dateStyle: 'medium',
								timeZone: 'UTC'
							})}</time
						>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</div>
