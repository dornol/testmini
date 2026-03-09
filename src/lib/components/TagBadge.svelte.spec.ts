import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import TagBadge from './TagBadge.svelte';

describe('TagBadge', () => {
	it('should render the tag name', async () => {
		render(TagBadge, { name: 'Bug', color: '#ff0000' });

		await expect.element(page.getByText('Bug')).toBeInTheDocument();
	});

	it('should render a colored dot', async () => {
		const { container } = render(TagBadge, { name: 'Feature', color: '#00ff00' });

		const dot = container.querySelector('.h-2.w-2.rounded-full') as HTMLElement;
		expect(dot).not.toBeNull();
		expect(dot.style.backgroundColor).toBe('rgb(0, 255, 0)');
	});

	it('should show remove button when onremove is provided', async () => {
		render(TagBadge, { name: 'Bug', color: '#ff0000', onremove: () => {} });

		const removeBtn = page.getByRole('button');
		await expect.element(removeBtn).toBeInTheDocument();
	});

	it('should NOT show remove button when onremove is not provided', async () => {
		render(TagBadge, { name: 'Bug', color: '#ff0000' });

		const removeBtn = page.getByRole('button');
		await expect.element(removeBtn).not.toBeInTheDocument();
	});

	it('should call onremove when remove button is clicked', async () => {
		const onremove = vi.fn();
		render(TagBadge, { name: 'Bug', color: '#ff0000', onremove });

		const removeBtn = page.getByRole('button');
		await removeBtn.click();

		expect(onremove).toHaveBeenCalledOnce();
	});
});
