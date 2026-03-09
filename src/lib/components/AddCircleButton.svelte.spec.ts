import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import AddCircleButton from './AddCircleButton.svelte';

describe('AddCircleButton', () => {
	it('should render as a button when onclick is provided', async () => {
		render(AddCircleButton, { tip: 'Add item', onclick: () => {} });

		const btn = page.getByRole('button', { name: 'Add item' });
		await expect.element(btn).toBeInTheDocument();
	});

	it('should render as a span when onclick is not provided', async () => {
		const { container } = render(AddCircleButton, { tip: 'Add item' });

		const btn = page.getByRole('button');
		await expect.element(btn).not.toBeInTheDocument();

		const span = container.querySelector('span');
		expect(span).not.toBeNull();
	});

	it('should have correct aria-label from tip', async () => {
		render(AddCircleButton, { tip: 'Add new tag', onclick: () => {} });

		const btn = page.getByRole('button', { name: 'Add new tag' });
		await expect.element(btn).toBeInTheDocument();
	});

	it('should use default aria-label "Add" when tip is not provided', async () => {
		render(AddCircleButton, { onclick: () => {} });

		const btn = page.getByRole('button', { name: 'Add' });
		await expect.element(btn).toBeInTheDocument();
	});

	it('should call onclick when clicked', async () => {
		const onclick = vi.fn();
		render(AddCircleButton, { tip: 'Add item', onclick });

		const btn = page.getByRole('button', { name: 'Add item' });
		await btn.click();

		expect(onclick).toHaveBeenCalledOnce();
	});
});
