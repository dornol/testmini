import { render } from '@testing-library/svelte';
import { describe, it, expect } from 'vitest';
import VirtualListTest from './helpers/VirtualListTest.svelte';

describe('VirtualList', () => {
	it('renders a list container with role="list"', () => {
		const { container } = render(VirtualListTest, {
			props: { items: [], rowHeight: 44 }
		});
		const list = container.querySelector('[role="list"]');
		expect(list).toBeTruthy();
	});

	it('renders visible items as listitems', () => {
		const items = Array.from({ length: 5 }, (_, i) => ({ id: i, name: `Item ${i}` }));
		const { container } = render(VirtualListTest, {
			props: { items, rowHeight: 44 }
		});
		const listItems = container.querySelectorAll('[role="listitem"]');
		// With height=420px, rowHeight=44, overscan=10, all 5 items should be visible
		expect(listItems.length).toBe(5);
	});

	it('renders item content correctly', () => {
		const items = [{ id: 0, name: 'First Item' }, { id: 1, name: 'Second Item' }];
		const { container } = render(VirtualListTest, {
			props: { items, rowHeight: 44 }
		});
		expect(container.textContent).toContain('First Item');
		expect(container.textContent).toContain('Second Item');
	});

	it('sets correct container height when not using window scroll', () => {
		const { container } = render(VirtualListTest, {
			props: { items: [], rowHeight: 44, height: '500px' }
		});
		const list = container.querySelector('[role="list"]') as HTMLElement;
		expect(list.style.height).toBe('500px');
	});

	it('uses min-height with window scroll mode', () => {
		const items = Array.from({ length: 100 }, (_, i) => ({ id: i, name: `Item ${i}` }));
		const { container } = render(VirtualListTest, {
			props: { items, rowHeight: 40, useWindowScroll: true }
		});
		const list = container.querySelector('[role="list"]') as HTMLElement;
		expect(list.style.minHeight).toBe(`${100 * 40}px`);
	});

	it('has overflow-auto class when not using window scroll', () => {
		const { container } = render(VirtualListTest, {
			props: { items: [], rowHeight: 44, useWindowScroll: false }
		});
		const list = container.querySelector('[role="list"]');
		expect(list?.className).toContain('overflow-auto');
	});

	it('does not have overflow-auto class with window scroll', () => {
		const { container } = render(VirtualListTest, {
			props: { items: [], rowHeight: 44, useWindowScroll: true }
		});
		const list = container.querySelector('[role="list"]');
		expect(list?.className).not.toContain('overflow-auto');
	});

	it('renders spacer divs for virtual scrolling', () => {
		const items = Array.from({ length: 100 }, (_, i) => ({ id: i, name: `Item ${i}` }));
		const { container } = render(VirtualListTest, {
			props: { items, rowHeight: 44, height: '200px' }
		});
		// First child (top spacer) and last child (bottom spacer) of the list
		const list = container.querySelector('[role="list"]');
		const children = list?.children;
		expect(children).toBeTruthy();
		if (children && children.length >= 2) {
			const topSpacer = children[0] as HTMLElement;
			const bottomSpacer = children[children.length - 1] as HTMLElement;
			// Top spacer should be 0 at initial position
			expect(topSpacer.style.height).toBe('0px');
			// Bottom spacer should exist
			expect(bottomSpacer.style.height).toBeTruthy();
		}
	});

	it('handles empty items array', () => {
		const { container } = render(VirtualListTest, {
			props: { items: [], rowHeight: 44 }
		});
		const listItems = container.querySelectorAll('[role="listitem"]');
		expect(listItems.length).toBe(0);
	});

	it('uses default props correctly', () => {
		const { container } = render(VirtualListTest, {
			props: { items: [{ id: 0, name: 'Test' }] }
		});
		const list = container.querySelector('[role="list"]') as HTMLElement;
		// Default height is 420px
		expect(list.style.height).toBe('420px');
	});
});
