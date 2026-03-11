<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		items: unknown[];
		rowHeight?: number;
		overscan?: number;
		height?: string;
		useWindowScroll?: boolean;
		children: Snippet<[{ item: unknown; index: number }]>;
	}

	let {
		items,
		rowHeight = 44,
		overscan = 10,
		height = '420px',
		useWindowScroll = false,
		children
	}: Props = $props();

	let container: HTMLDivElement | undefined = $state();
	let scrollTop = $state(0);
	let viewportHeight = $state(0);
	let _scrollParent: HTMLElement | null = null;

	const totalHeight = $derived(items.length * rowHeight);
	const startIndex = $derived(Math.max(0, Math.floor(scrollTop / rowHeight) - overscan));
	const endIndex = $derived(
		Math.min(items.length, Math.ceil((scrollTop + viewportHeight) / rowHeight) + overscan)
	);
	const visibleItems = $derived(items.slice(startIndex, endIndex));
	const topSpacer = $derived(startIndex * rowHeight);
	const bottomSpacer = $derived(Math.max(0, totalHeight - endIndex * rowHeight));

	function handleScroll(e: Event) {
		const target = e.currentTarget as HTMLDivElement;
		scrollTop = target.scrollTop;
		viewportHeight = target.clientHeight;
	}

	function getScrollParent(el: HTMLElement): HTMLElement | null {
		let parent = el.parentElement;
		while (parent) {
			const { overflow, overflowY } = getComputedStyle(parent);
			if (/(auto|scroll)/.test(overflow + overflowY)) {
				return parent;
			}
			parent = parent.parentElement;
		}
		return null;
	}

	function updateExternalScroll(scrollParent: HTMLElement | null) {
		if (!container) return;
		const containerRect = container.getBoundingClientRect();
		if (scrollParent) {
			const parentRect = scrollParent.getBoundingClientRect();
			viewportHeight = scrollParent.clientHeight;
			scrollTop = Math.max(0, parentRect.top - containerRect.top);
		} else {
			viewportHeight = window.innerHeight;
			scrollTop = Math.max(0, -containerRect.top);
		}
	}

	export function scrollToIndex(index: number) {
		if (!container) return;
		const targetOffset = index * rowHeight;

		if (useWindowScroll) {
			const sp = _scrollParent ?? getScrollParent(container);
			if (sp) {
				// Calculate container's absolute position within the scroll parent
				const containerRect = container.getBoundingClientRect();
				const parentRect = sp.getBoundingClientRect();
				const containerTopInParent = containerRect.top - parentRect.top + sp.scrollTop;
				sp.scrollTo({ top: containerTopInParent + targetOffset, behavior: 'instant' });
			}
		} else {
			container.scrollTo({ top: targetOffset, behavior: 'instant' });
		}
	}

	$effect(() => {
		if (!container) return;
		if (useWindowScroll) {
			const scrollParent = getScrollParent(container);
			_scrollParent = scrollParent;
			const target: HTMLElement | Window = scrollParent ?? window;
			const handler = () => updateExternalScroll(scrollParent);
			handler();
			target.addEventListener('scroll', handler, { passive: true });
			window.addEventListener('resize', handler, { passive: true });
			return () => {
				target.removeEventListener('scroll', handler);
				window.removeEventListener('resize', handler);
			};
		} else {
			viewportHeight = container.clientHeight;
		}
	});
</script>

<div
	bind:this={container}
	role="list"
	class={useWindowScroll ? '' : 'overflow-auto'}
	style={useWindowScroll ? `min-height: ${totalHeight}px; position: relative;` : `height: ${height};`}
	onscroll={useWindowScroll ? undefined : handleScroll}
>
	<div style="height: {topSpacer}px;"></div>
	{#each visibleItems as item, i (startIndex + i)}
		<div role="listitem">
			{@render children({ item, index: startIndex + i })}
		</div>
	{/each}
	<div style="height: {bottomSpacer}px;"></div>
</div>
