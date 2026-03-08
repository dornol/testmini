<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import PriorityBadge from '$lib/components/PriorityBadge.svelte';
	import * as m from '$lib/paraglide/messages.js';

	let {
		open = $bindable(false),
		v1,
		v2,
		projectPriorities
	}: {
		open: boolean;
		v1: { versionNo: number; priority: string; title: string; precondition?: string | null; expectedResult?: string | null; steps?: Step[] | null } | null;
		v2: { versionNo: number; priority: string; title: string; precondition?: string | null; expectedResult?: string | null; steps?: Step[] | null } | null;
		projectPriorities: { id: number; name: string; color: string; position: number; isDefault: boolean }[];
	} = $props();

	function getPriorityColor(name: string): string {
		return projectPriorities.find((p) => p.name === name)?.color ?? '#6b7280';
	}

	// Word-level diff using LCS
	function wordDiff(a: string, b: string): { type: 'same' | 'added' | 'removed'; text: string }[] {
		const wordsA = (a || '').split(/(\s+)/);
		const wordsB = (b || '').split(/(\s+)/);
		const m2 = wordsA.length;
		const n = wordsB.length;

		// LCS table
		const dp: number[][] = Array.from({ length: m2 + 1 }, () => Array(n + 1).fill(0));
		for (let i = 1; i <= m2; i++) {
			for (let j = 1; j <= n; j++) {
				if (wordsA[i - 1] === wordsB[j - 1]) {
					dp[i][j] = dp[i - 1][j - 1] + 1;
				} else {
					dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
				}
			}
		}

		// Backtrack
		const result: { type: 'same' | 'added' | 'removed'; text: string }[] = [];
		let i = m2, j = n;
		const stack: { type: 'same' | 'added' | 'removed'; text: string }[] = [];
		while (i > 0 || j > 0) {
			if (i > 0 && j > 0 && wordsA[i - 1] === wordsB[j - 1]) {
				stack.push({ type: 'same', text: wordsA[i - 1] });
				i--; j--;
			} else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
				stack.push({ type: 'added', text: wordsB[j - 1] });
				j--;
			} else {
				stack.push({ type: 'removed', text: wordsA[i - 1] });
				i--;
			}
		}
		stack.reverse();

		// Merge consecutive same-type tokens
		for (const item of stack) {
			if (result.length > 0 && result[result.length - 1].type === item.type) {
				result[result.length - 1].text += item.text;
			} else {
				result.push({ ...item });
			}
		}

		return result;
	}

	type Step = { order: number; action: string; expected: string };

	function stepsChanged(s1: Step[], s2: Step[]): boolean {
		if (s1.length !== s2.length) return true;
		return s1.some((s, i) => s.action !== s2[i].action || s.expected !== s2[i].expected);
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Portal>
		<Dialog.Overlay />
		<Dialog.Content class="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
			<Dialog.Header>
				<Dialog.Title>{m.tc_version_diff_title()}</Dialog.Title>
				{#if v1 && v2}
					<Dialog.Description>
						v{v1.versionNo} &rarr; v{v2.versionNo}
					</Dialog.Description>
				{/if}
			</Dialog.Header>

			{#if v1 && v2}
				<div class="space-y-4 py-4">
					<!-- Priority -->
					{#if v1.priority !== v2.priority}
						<div class="space-y-1">
							<h4 class="text-xs font-semibold uppercase text-muted-foreground">{m.common_priority()}</h4>
							<div class="flex items-center gap-2">
								<span class="line-through opacity-60"><PriorityBadge name={v1.priority} color={getPriorityColor(v1.priority)} /></span>
								<span class="text-muted-foreground">&rarr;</span>
								<PriorityBadge name={v2.priority} color={getPriorityColor(v2.priority)} />
							</div>
						</div>
					{/if}

					<!-- Title -->
					{#if v1.title !== v2.title}
						<div class="space-y-1">
							<h4 class="text-xs font-semibold uppercase text-muted-foreground">{m.common_title()}</h4>
							<div class="rounded border p-3 text-sm">
								{#each wordDiff(v1.title, v2.title) as seg}
									{#if seg.type === 'removed'}
										<span class="bg-red-100 text-red-800 line-through dark:bg-red-950 dark:text-red-300">{seg.text}</span>
									{:else if seg.type === 'added'}
										<span class="bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300">{seg.text}</span>
									{:else}
										<span>{seg.text}</span>
									{/if}
								{/each}
							</div>
						</div>
					{/if}

					<!-- Precondition -->
					{#if (v1.precondition ?? '') !== (v2.precondition ?? '')}
						<div class="space-y-1">
							<h4 class="text-xs font-semibold uppercase text-muted-foreground">{m.tc_precondition()}</h4>
							<div class="rounded border p-3 text-sm whitespace-pre-wrap">
								{#each wordDiff(v1.precondition ?? '', v2.precondition ?? '') as seg}
									{#if seg.type === 'removed'}
										<span class="bg-red-100 text-red-800 line-through dark:bg-red-950 dark:text-red-300">{seg.text}</span>
									{:else if seg.type === 'added'}
										<span class="bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300">{seg.text}</span>
									{:else}
										<span>{seg.text}</span>
									{/if}
								{/each}
							</div>
						</div>
					{/if}

					<!-- Expected Result -->
					{#if (v1.expectedResult ?? '') !== (v2.expectedResult ?? '')}
						<div class="space-y-1">
							<h4 class="text-xs font-semibold uppercase text-muted-foreground">{m.tc_expected_result()}</h4>
							<div class="rounded border p-3 text-sm whitespace-pre-wrap">
								{#each wordDiff(v1.expectedResult ?? '', v2.expectedResult ?? '') as seg}
									{#if seg.type === 'removed'}
										<span class="bg-red-100 text-red-800 line-through dark:bg-red-950 dark:text-red-300">{seg.text}</span>
									{:else if seg.type === 'added'}
										<span class="bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300">{seg.text}</span>
									{:else}
										<span>{seg.text}</span>
									{/if}
								{/each}
							</div>
						</div>
					{/if}

					<!-- Steps -->
					{#if stepsChanged(v1.steps ?? [], v2.steps ?? [])}
						<div class="space-y-2">
							<h4 class="text-xs font-semibold uppercase text-muted-foreground">{m.tc_version_diff_steps()}</h4>
							{#each Array(Math.max((v1.steps ?? []).length, (v2.steps ?? []).length)) as _, idx}
								{@const s1 = (v1.steps ?? [])[idx]}
								{@const s2 = (v2.steps ?? [])[idx]}
								<div class="rounded border p-3 text-sm {!s1 ? 'border-green-300 bg-green-50 dark:bg-green-950/20' : !s2 ? 'border-red-300 bg-red-50 dark:bg-red-950/20' : ''}">
									<div class="flex items-center gap-2 mb-1">
										<span class="text-xs font-bold text-muted-foreground">#{idx + 1}</span>
										{#if !s1}
											<Badge variant="outline" class="text-[10px] text-green-600">{m.tc_version_diff_added()}</Badge>
										{:else if !s2}
											<Badge variant="outline" class="text-[10px] text-red-600">{m.tc_version_diff_removed()}</Badge>
										{/if}
									</div>
									{#if s1 && s2}
										{#if s1.action !== s2.action}
											<div class="mb-1">
												<span class="text-xs text-muted-foreground">{m.tc_detail_action()}:</span>
												<div>
													{#each wordDiff(s1.action, s2.action) as seg}
														{#if seg.type === 'removed'}
															<span class="bg-red-100 text-red-800 line-through dark:bg-red-950 dark:text-red-300">{seg.text}</span>
														{:else if seg.type === 'added'}
															<span class="bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300">{seg.text}</span>
														{:else}
															<span>{seg.text}</span>
														{/if}
													{/each}
												</div>
											</div>
										{/if}
										{#if s1.expected !== s2.expected}
											<div>
												<span class="text-xs text-muted-foreground">{m.tc_detail_expected()}:</span>
												<div>
													{#each wordDiff(s1.expected, s2.expected) as seg}
														{#if seg.type === 'removed'}
															<span class="bg-red-100 text-red-800 line-through dark:bg-red-950 dark:text-red-300">{seg.text}</span>
														{:else if seg.type === 'added'}
															<span class="bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300">{seg.text}</span>
														{:else}
															<span>{seg.text}</span>
														{/if}
													{/each}
												</div>
											</div>
										{/if}
									{:else if s2}
										<div>{m.tc_detail_action()}: {s2.action}</div>
										{#if s2.expected}<div class="text-muted-foreground">{m.tc_detail_expected()}: {s2.expected}</div>{/if}
									{:else if s1}
										<div class="line-through">{m.tc_detail_action()}: {s1.action}</div>
										{#if s1.expected}<div class="text-muted-foreground line-through">{m.tc_detail_expected()}: {s1.expected}</div>{/if}
									{/if}
								</div>
							{/each}
						</div>
					{/if}

					<!-- No changes -->
					{#if v1.priority === v2.priority && v1.title === v2.title && (v1.precondition ?? '') === (v2.precondition ?? '') && (v1.expectedResult ?? '') === (v2.expectedResult ?? '') && !stepsChanged(v1.steps ?? [], v2.steps ?? [])}
						<p class="text-muted-foreground text-sm text-center py-4">{m.tc_version_no_change()}</p>
					{/if}
				</div>
			{/if}
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
