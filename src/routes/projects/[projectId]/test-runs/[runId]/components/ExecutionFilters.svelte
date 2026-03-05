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

<div class="flex flex-wrap items-center gap-1">
	{#each statusTabs as tab (tab.key)}
		<Button
			variant={statusFilter === tab.key ? 'default' : 'outline'}
			size="sm"
			class="h-7 px-3 text-xs"
			onclick={() => setStatusFilter(tab.key)}
		>
			{tab.label}
			<span class="ml-1 opacity-70">({tab.count})</span>
		</Button>
	{/each}
	<span class="text-muted-foreground ml-auto text-sm">
		{m.run_showing_count({ count: executionCount })}
	</span>
</div>
