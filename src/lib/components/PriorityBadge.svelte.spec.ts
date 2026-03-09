import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import PriorityBadge from './PriorityBadge.svelte';

describe('PriorityBadge', () => {
	it('should render the priority name text', async () => {
		render(PriorityBadge, { name: 'High', color: '#ff0000' });

		await expect.element(page.getByText('High')).toBeInTheDocument();
	});

	it('should render a colored dot with correct background-color', async () => {
		const { container } = render(PriorityBadge, { name: 'Medium', color: '#00ff00' });

		const dot = container.querySelector('.h-2.w-2.rounded-full') as HTMLElement;
		expect(dot).not.toBeNull();
		expect(dot.style.backgroundColor).toBe('rgb(0, 255, 0)');
	});

	it('should apply color to the text wrapper', async () => {
		const { container } = render(PriorityBadge, { name: 'Low', color: '#0000ff' });

		const wrapper = container.querySelector('.inline-flex') as HTMLElement;
		expect(wrapper).not.toBeNull();
		expect(wrapper.style.color).toBe('rgb(0, 0, 255)');
	});
});
