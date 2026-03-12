import { render, screen } from '@testing-library/svelte';
import { describe, it, expect, vi } from 'vitest';
import CommentForm from '../CommentForm.svelte';

describe('CommentForm', () => {
	it('renders textarea', () => {
		const { container } = render(CommentForm, {
			props: { value: '', onsubmit: vi.fn() }
		});
		const textarea = container.querySelector('textarea');
		expect(textarea).toBeTruthy();
	});

	it('renders submit button with label', () => {
		render(CommentForm, {
			props: { value: '', onsubmit: vi.fn(), submitLabel: 'Post Comment' }
		});
		expect(screen.getByText('Post Comment')).toBeTruthy();
	});

	it('disables submit button when value is empty', () => {
		render(CommentForm, {
			props: { value: '', onsubmit: vi.fn() }
		});
		// Default submitLabel comes from paraglide mock
		const buttons = screen.getAllByRole('button');
		const submitBtn = buttons[0] as HTMLButtonElement;
		expect(submitBtn.disabled).toBe(true);
	});

	it('enables submit button when value has content', () => {
		render(CommentForm, {
			props: { value: 'Hello', onsubmit: vi.fn() }
		});
		const buttons = screen.getAllByRole('button');
		const submitBtn = buttons[0] as HTMLButtonElement;
		expect(submitBtn.disabled).toBe(false);
	});

	it('disables submit button when submitting', () => {
		render(CommentForm, {
			props: { value: 'Hello', submitting: true, onsubmit: vi.fn() }
		});
		// When submitting, shows saving text
		expect(screen.getByText('저장 중...')).toBeTruthy();
		const buttons = screen.getAllByRole('button');
		const submitBtn = buttons[0] as HTMLButtonElement;
		expect(submitBtn.disabled).toBe(true);
	});

	it('does not render cancel button when oncancel is not provided', () => {
		const { container } = render(CommentForm, {
			props: { value: '', onsubmit: vi.fn() }
		});
		const buttons = container.querySelectorAll('button');
		expect(buttons.length).toBe(1); // only submit
	});

	it('renders cancel button when oncancel is provided', () => {
		const { container } = render(CommentForm, {
			props: { value: '', onsubmit: vi.fn(), oncancel: vi.fn() }
		});
		const buttons = container.querySelectorAll('button');
		expect(buttons.length).toBe(2); // submit + cancel
	});

	it('calls oncancel when cancel button clicked', () => {
		const oncancel = vi.fn();
		render(CommentForm, {
			props: { value: '', onsubmit: vi.fn(), oncancel }
		});
		screen.getByText('취소').click();
		expect(oncancel).toHaveBeenCalledOnce();
	});

	it('calls onsubmit when submit button clicked', () => {
		const onsubmit = vi.fn();
		render(CommentForm, {
			props: { value: 'Test content', onsubmit }
		});
		const buttons = screen.getAllByRole('button');
		buttons[0].click();
		expect(onsubmit).toHaveBeenCalledOnce();
	});

	it('uses custom cancel label', () => {
		render(CommentForm, {
			props: { value: '', onsubmit: vi.fn(), oncancel: vi.fn(), cancelLabel: 'Discard' }
		});
		expect(screen.getByText('Discard')).toBeTruthy();
	});

	it('sets textarea rows attribute', () => {
		const { container } = render(CommentForm, {
			props: { value: '', onsubmit: vi.fn(), rows: 5 }
		});
		const textarea = container.querySelector('textarea');
		expect(textarea?.rows).toBe(5);
	});
});
