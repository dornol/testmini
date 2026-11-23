import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import TouchCheckbox from '../TouchCheckbox.svelte';
import TouchCheckboxRow from './helpers/TouchCheckboxRow.svelte';

const box = () => screen.getByRole('checkbox') as HTMLInputElement;

describe('TouchCheckbox', () => {
	it('keeps the visible box at 16px and widens only the hit area through its label', () => {
		render(TouchCheckbox, { props: { 'aria-label': 'Select' } });
		expect(box().className).toContain('size-4');
		const label = box().closest('label')!;
		// size-10 hit area with a matching negative margin, so the layout box stays 16px.
		expect(label.className).toContain('size-10');
		expect(label.className).toContain('-m-3');
	});

	it('uses a smaller 32px hit area when dense so it does not overlap a neighbour', () => {
		render(TouchCheckbox, { props: { 'aria-label': 'Select', dense: true } });
		const label = box().closest('label')!;
		expect(label.className).toContain('size-8');
		expect(label.className).toContain('-m-2');
		expect(label.className).not.toContain('size-10');
	});

	it('draws the box border with a colour that is visible against the page', () => {
		render(TouchCheckbox, { props: { 'aria-label': 'Select' } });
		expect(box().className).toContain('border-muted-foreground');
		expect(box().className).not.toContain('border-gray-300');
	});

	it('passes attributes and handlers through to the input', async () => {
		const onchange = vi.fn();
		render(TouchCheckbox, { props: { 'aria-label': 'Pick row', checked: false, onchange } });
		expect(screen.getByRole('checkbox', { name: 'Pick row' })).toBeTruthy();
		await userEvent.click(box());
		expect(onchange).toHaveBeenCalledTimes(1);
		expect(box().checked).toBe(true);
	});

	it('toggles when the padding around the box is clicked', async () => {
		const onchange = vi.fn();
		render(TouchCheckbox, { props: { 'aria-label': 'Select', onchange } });
		await userEvent.click(box().closest('label')!);
		expect(onchange).toHaveBeenCalledTimes(1);
		expect(box().checked).toBe(true);
	});

	it('does not let clicks reach a clickable row behind it, from the box or the padding', async () => {
		const onrow = vi.fn();
		render(TouchCheckboxRow, { props: { onrow } });

		await userEvent.click(box().closest('label')!);
		await userEvent.click(box());
		expect(onrow).not.toHaveBeenCalled();
		// ...while a click elsewhere in the row still reaches it.
		await userEvent.click(screen.getByRole('presentation'));
		expect(onrow).toHaveBeenCalledTimes(1);
	});

	it('supports the indeterminate state for a "select all" box', () => {
		render(TouchCheckbox, { props: { 'aria-label': 'Select all', indeterminate: true } });
		expect(box().indeterminate).toBe(true);
	});

	it('can be disabled', () => {
		render(TouchCheckbox, { props: { 'aria-label': 'Select', disabled: true } });
		expect(box().disabled).toBe(true);
	});
});
