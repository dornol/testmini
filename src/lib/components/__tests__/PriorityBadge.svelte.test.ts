import { render, screen } from '@testing-library/svelte';
import { describe, it, expect } from 'vitest';
import PriorityBadge from '../PriorityBadge.svelte';

describe('PriorityBadge', () => {
	it('renders the priority name', () => {
		render(PriorityBadge, { props: { name: 'High', color: '#ef4444' } });
		expect(screen.getByText('High')).toBeTruthy();
	});

	it('applies color to the text', () => {
		const { container } = render(PriorityBadge, {
			props: { name: 'Critical', color: '#dc2626' }
		});
		const span = container.querySelector('span');
		expect(span?.getAttribute('style')).toContain('color');
	});

	it('renders a colored dot indicator', () => {
		const { container } = render(PriorityBadge, {
			props: { name: 'Low', color: '#22c55e' }
		});
		const dot = container.querySelector('.rounded-full');
		expect(dot).toBeTruthy();
		expect(dot?.getAttribute('style')).toContain('background-color');
	});

	it('renders different priority levels correctly', () => {
		const priorities = [
			{ name: 'Critical', color: '#dc2626' },
			{ name: 'High', color: '#ef4444' },
			{ name: 'Medium', color: '#f59e0b' },
			{ name: 'Low', color: '#22c55e' }
		];

		for (const { name, color } of priorities) {
			const { container, unmount } = render(PriorityBadge, { props: { name, color } });
			expect(screen.getByText(name)).toBeTruthy();
			const dot = container.querySelector('.rounded-full');
			expect(dot?.getAttribute('style')).toContain('background-color');
			unmount();
		}
	});

	it('truncates long priority names', () => {
		const { container } = render(PriorityBadge, {
			props: { name: 'Very Long Priority Name That Should Be Truncated', color: '#000' }
		});
		const textSpan = container.querySelector('.truncate');
		expect(textSpan).toBeTruthy();
		expect(textSpan?.textContent?.trim()).toBe('Very Long Priority Name That Should Be Truncated');
	});
});
