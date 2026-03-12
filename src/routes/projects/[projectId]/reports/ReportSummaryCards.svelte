<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';

	let {
		envStats,
	}: {
		envStats: Array<{
			environment: string;
			totalRuns: number;
			totalExecs: number;
			passCount: number;
			failCount: number;
		}>;
	} = $props();

	function barWidth(value: number, total: number): string {
		if (total === 0) return '0%';
		return `${(value / total) * 100}%`;
	}
</script>

<Card.Root>
	<Card.Header>
		<Card.Title class="text-sm font-medium">{m.reports_env_pass_rate()}</Card.Title>
	</Card.Header>
	<Card.Content>
		{#if envStats.length === 0}
			<p class="text-muted-foreground text-sm">{m.reports_no_runs()}</p>
		{:else}
			<div class="grid gap-4 sm:grid-cols-2">
				{#each envStats as env (env.environment)}
					{@const rate = env.totalExecs > 0 ? Math.round((env.passCount / env.totalExecs) * 100) : 0}
					<div class="rounded-lg border p-4">
						<div class="flex items-center justify-between">
							<Badge variant="outline">{env.environment}</Badge>
							<span class="text-2xl font-bold {rate >= 80 ? 'text-green-600' : rate >= 50 ? 'text-yellow-600' : env.totalExecs === 0 ? '' : 'text-red-600'}">
								{env.totalExecs > 0 ? `${rate}%` : '-'}
							</span>
						</div>
						<div class="mt-3 space-y-1">
							<div class="bg-secondary flex h-2 overflow-hidden rounded-full">
								{#if env.passCount > 0}
									<div class="bg-green-500" style="width: {barWidth(env.passCount, env.totalExecs)}"></div>
								{/if}
								{#if env.failCount > 0}
									<div class="bg-red-500" style="width: {barWidth(env.failCount, env.totalExecs)}"></div>
								{/if}
							</div>
							<div class="text-muted-foreground flex justify-between text-xs">
								<span>{m.reports_runs_count({ count: env.totalRuns })}</span>
								<span>{m.reports_pass_fail({ pass: env.passCount, fail: env.failCount })}</span>
							</div>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</Card.Content>
</Card.Root>
