import { render, screen } from '@testing-library/svelte';
import { describe, it, expect, vi } from 'vitest';
import TagBadge from '../TagBadge.svelte';

describe('TagBadge', () => {
	it('renders the tag name', () => {
		render(TagBadge, { props: { name: 'Bug', color: '#ef4444' } });
		expect(screen.getByText('Bug')).toBeTruthy();
	});

	it('renders a colored dot', () => {
		const { container } = render(TagBadge, {
			props: { name: 'Feature', color: '#3b82f6' }
		});
		const dot = container.querySelector('.h-2.w-2.rounded-full');
		expect(dot).toBeTruthy();
		expect(dot?.getAttribute('style')).toContain('background-color');
	});

	it('does not render remove button when onremove is not provided', () => {
		const { container } = render(TagBadge, {
			props: { name: 'Tag', color: '#000' }
		});
		const buttons = container.querySelectorAll('button');
		expect(buttons.length).toBe(0);
	});

	it('renders remove button when onremove is provided', () => {
		const onremove = vi.fn();
		const { container } = render(TagBadge, {
			props: { name: 'Removable', color: '#f00', onremove }
		});
		const button = container.querySelector('button');
		expect(button).toBeTruthy();
		expect(button?.textContent).toContain('×');
	});

	it('calls onremove when remove button is clicked', async () => {
		const onremove = vi.fn();
		const { container } = render(TagBadge, {
			props: { name: 'Removable', color: '#f00', onremove }
		});
		const button = container.querySelector('button')!;
		button.click();
		expect(onremove).toHaveBeenCalledOnce();
	});

	it('has correct badge structure with border and rounded-full', () => {
		const { container } = render(TagBadge, {
			props: { name: 'Styled', color: '#8b5cf6' }
		});
		const badge = container.querySelector('.rounded-full.border');
		expect(badge).toBeTruthy();
	});
});
