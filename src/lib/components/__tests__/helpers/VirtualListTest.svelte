<script lang="ts">
	import VirtualList from '../../VirtualList.svelte';

	interface Props {
		items: { id: number; name: string }[];
		rowHeight?: number;
		height?: string;
		useWindowScroll?: boolean;
		overscan?: number;
	}

	let {
		items,
		rowHeight = 44,
		height = '420px',
		useWindowScroll = false,
		overscan = 10
	}: Props = $props();
</script>

<VirtualList {items} {rowHeight} {height} {useWindowScroll} {overscan}>
	{#snippet children({ item, index })}
		<div data-index={index}>{(item as { id: number; name: string }).name}</div>
	{/snippet}
</VirtualList>
