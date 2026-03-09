import { page } from 'vitest/browser';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { overwriteGetLocale } from '$lib/paraglide/runtime.js';
import CommentForm from './CommentForm.svelte';

beforeEach(() => {
	overwriteGetLocale(() => 'en');
});

describe('CommentForm', () => {
	it('should render a textarea', async () => {
		render(CommentForm, { onsubmit: () => {} });

		const textarea = page.getByRole('textbox');
		await expect.element(textarea).toBeInTheDocument();
	});

	it('should have submit button disabled when value is empty', async () => {
		render(CommentForm, { value: '', onsubmit: () => {} });

		// Submit button text defaults to "Comment"
		const submitBtn = page.getByRole('button', { name: 'Comment' });
		await expect.element(submitBtn).toBeDisabled();
	});

	it('should have submit button enabled when value is non-empty', async () => {
		render(CommentForm, { value: 'Hello', onsubmit: () => {} });

		const submitBtn = page.getByRole('button', { name: 'Comment' });
		await expect.element(submitBtn).not.toBeDisabled();
	});

	it('should show cancel button only when oncancel is provided', async () => {
		render(CommentForm, { onsubmit: () => {}, oncancel: () => {} });

		const cancelBtn = page.getByRole('button', { name: 'Cancel' });
		await expect.element(cancelBtn).toBeInTheDocument();
	});

	it('should NOT show cancel button when oncancel is not provided', async () => {
		render(CommentForm, { onsubmit: () => {} });

		const cancelBtn = page.getByRole('button', { name: 'Cancel' });
		await expect.element(cancelBtn).not.toBeInTheDocument();
	});

	it('should show submitting state text', async () => {
		render(CommentForm, { value: 'test', submitting: true, onsubmit: () => {} });

		// When submitting=true, button text changes to "Saving..."
		const submitBtn = page.getByRole('button', { name: 'Saving...' });
		await expect.element(submitBtn).toBeInTheDocument();
		await expect.element(submitBtn).toBeDisabled();
	});
});
