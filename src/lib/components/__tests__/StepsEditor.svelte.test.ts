import { render, screen } from '@testing-library/svelte';
import { describe, it, expect, vi } from 'vitest';
import StepsEditor from '../StepsEditor.svelte';

describe('StepsEditor', () => {
	it('renders empty state when no steps', () => {
		render(StepsEditor, {
			props: { value: [], onchange: vi.fn() }
		});
		expect(screen.getByText('결과가 없습니다.')).toBeTruthy();
	});

	it('renders the title label', () => {
		render(StepsEditor, {
			props: { value: [], onchange: vi.fn() }
		});
		expect(screen.getByText('단계')).toBeTruthy();
	});

	it('renders add button when not disabled', () => {
		render(StepsEditor, {
			props: { value: [], onchange: vi.fn(), disabled: false }
		});
		expect(screen.getByText('단계 추가')).toBeTruthy();
	});

	it('hides add button when disabled', () => {
		render(StepsEditor, {
			props: { value: [], onchange: vi.fn(), disabled: true }
		});
		expect(screen.queryByText('단계 추가')).toBeNull();
	});

	it('renders steps with numbered labels', () => {
		render(StepsEditor, {
			props: {
				value: [
					{ action: 'Click button', expected: 'Dialog opens' },
					{ action: 'Fill form', expected: 'Form filled' }
				],
				onchange: vi.fn()
			}
		});
		expect(screen.getByText('단계 1')).toBeTruthy();
		expect(screen.getByText('단계 2')).toBeTruthy();
	});

	it('renders action and expected inputs for each step', () => {
		const { container } = render(StepsEditor, {
			props: {
				value: [{ action: 'Click button', expected: 'Dialog opens' }],
				onchange: vi.fn()
			}
		});
		const inputs = container.querySelectorAll('input');
		expect(inputs.length).toBe(2);
		expect(inputs[0].value).toBe('Click button');
		expect(inputs[1].value).toBe('Dialog opens');
	});

	it('calls onchange with new step added when add button clicked', () => {
		const onchange = vi.fn();
		render(StepsEditor, {
			props: { value: [], onchange }
		});
		screen.getByText('단계 추가').click();
		expect(onchange).toHaveBeenCalledOnce();
		const newSteps = onchange.mock.calls[0][0];
		expect(newSteps.length).toBe(1);
		expect(newSteps[0].action).toBe('');
		expect(newSteps[0].expected).toBe('');
	});

	it('calls onchange without the step when remove button clicked', () => {
		const onchange = vi.fn();
		const { container } = render(StepsEditor, {
			props: {
				value: [
					{ action: 'Step 1', expected: 'Expected 1' },
					{ action: 'Step 2', expected: 'Expected 2' }
				],
				onchange
			}
		});
		// Find the remove (X) buttons - they have text-destructive class
		const removeButtons = container.querySelectorAll('.text-destructive');
		expect(removeButtons.length).toBe(2);
		(removeButtons[0] as HTMLElement).click();
		expect(onchange).toHaveBeenCalledOnce();
		const remaining = onchange.mock.calls[0][0];
		expect(remaining.length).toBe(1);
		expect(remaining[0].action).toBe('Step 2');
	});

	it('disables up button for first step', () => {
		const { container } = render(StepsEditor, {
			props: {
				value: [{ action: 'Only step', expected: '' }],
				onchange: vi.fn()
			}
		});
		// First button in the step controls should be the up button (disabled)
		const buttons = container.querySelectorAll('.h-7.w-7');
		const upButton = buttons[0] as HTMLButtonElement;
		expect(upButton.disabled).toBe(true);
	});

	it('disables down button for last step', () => {
		const { container } = render(StepsEditor, {
			props: {
				value: [{ action: 'Only step', expected: '' }],
				onchange: vi.fn()
			}
		});
		const buttons = container.querySelectorAll('.h-7.w-7');
		const downButton = buttons[1] as HTMLButtonElement;
		expect(downButton.disabled).toBe(true);
	});

	it('calls onchange with swapped steps when move up clicked', () => {
		const onchange = vi.fn();
		const { container } = render(StepsEditor, {
			props: {
				value: [
					{ action: 'First', expected: '' },
					{ action: 'Second', expected: '' }
				],
				onchange
			}
		});
		// Second step's up button
		const steps = container.querySelectorAll('.rounded-md.border.p-3');
		const secondStepButtons = steps[1].querySelectorAll('.h-7.w-7');
		(secondStepButtons[0] as HTMLElement).click(); // up button

		expect(onchange).toHaveBeenCalledOnce();
		const reordered = onchange.mock.calls[0][0];
		expect(reordered[0].action).toBe('Second');
		expect(reordered[1].action).toBe('First');
	});

	it('hides move and remove buttons when disabled', () => {
		const { container } = render(StepsEditor, {
			props: {
				value: [{ action: 'Step 1', expected: '' }],
				onchange: vi.fn(),
				disabled: true
			}
		});
		const buttons = container.querySelectorAll('.h-7.w-7');
		expect(buttons.length).toBe(0);
	});

	it('calls onchange with updated action when input changes', () => {
		const onchange = vi.fn();
		const { container } = render(StepsEditor, {
			props: {
				value: [{ action: 'Original', expected: 'Exp' }],
				onchange
			}
		});
		const actionInput = container.querySelector('#step-action-0') as HTMLInputElement;
		expect(actionInput).toBeTruthy();

		// Simulate input event
		actionInput.value = 'Updated';
		actionInput.dispatchEvent(new Event('input', { bubbles: true }));

		expect(onchange).toHaveBeenCalledOnce();
		const updated = onchange.mock.calls[0][0];
		expect(updated[0].action).toBe('Updated');
		expect(updated[0].expected).toBe('Exp');
	});

	it('renders multiple steps correctly', () => {
		const steps = Array.from({ length: 5 }, (_, i) => ({
			action: `Action ${i + 1}`,
			expected: `Expected ${i + 1}`
		}));
		const { container } = render(StepsEditor, {
			props: { value: steps, onchange: vi.fn() }
		});
		const stepCards = container.querySelectorAll('.rounded-md.border.p-3');
		expect(stepCards.length).toBe(5);
	});
});
