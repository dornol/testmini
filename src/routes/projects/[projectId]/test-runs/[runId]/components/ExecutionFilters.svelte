<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as m from '$lib/paraglide/messages.js';

	interface StatusTab {
		key: string;
		label: string;
		count: number;
	}

	interface Props {
		statusTabs: StatusTab[];
		statusFilter: string;
		executionCount: number;
		onFilterChange?: (scrollToTop: () => void) => void;
	}

	let { statusTabs, statusFilter, executionCount, onFilterChange }: Props = $props();

	function setStatusFilter(status: string) {
		const params = new URLSearchParams(page.url.searchParams);
		if (status) {
			params.set('status', status);
		} else {
			params.delete('status');
		}
		onFilterChange?.(() => {});
		goto(`?${params.toString()}`, { keepFocus: true });
	}
</script>

<div class="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
	<div class="grid grid-cols-2 gap-1 min-[420px]:flex min-[420px]:flex-wrap">
		{#each statusTabs as tab (tab.key)}
			<Button
				variant={statusFilter === tab.key ? 'default' : 'outline'}
				size="sm"
				class="h-8 w-full px-3 text-xs min-[420px]:h-7 min-[420px]:w-auto"
				onclick={() => setStatusFilter(tab.key)}
			>
				{tab.label}
				<span class="ml-1 tabular-nums">({tab.count})</span>
			</Button>
		{/each}
	</div>
	<span class="text-muted-foreground text-sm sm:ml-auto">
		{m.run_showing_count({ count: executionCount })}
	</span>
</div>
