<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import * as m from '$lib/paraglide/messages.js';

	let {
		page,
		pageCount,
		total,
		visibleCount,
		hasPrevious,
		hasNext,
		buildPageUrl
	}: {
		page: number;
		pageCount: number;
		total: number;
		visibleCount: number;
		hasPrevious: boolean;
		hasNext: boolean;
		buildPageUrl: (page: number) => string;
	} = $props();
</script>

{#if pageCount > 1}
	<div class="flex items-center justify-between gap-3 rounded-md border bg-card px-3 py-2 text-sm">
		<div class="text-muted-foreground">
			{m.common_page_of({ page, totalPages: pageCount })}
			<span class="ml-2 text-xs">{visibleCount} / {total}</span>
		</div>
		<div class="flex items-center gap-2">
			<Button variant="outline" size="sm" href={buildPageUrl(page - 1)} disabled={!hasPrevious}>
				{m.common_previous()}
			</Button>
			<Button variant="outline" size="sm" href={buildPageUrl(page + 1)} disabled={!hasNext}>
				{m.common_next()}
			</Button>
		</div>
	</div>
{/if}
