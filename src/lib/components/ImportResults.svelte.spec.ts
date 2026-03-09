import { page } from 'vitest/browser';
import { describe, expect, it, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { overwriteGetLocale } from '$lib/paraglide/runtime.js';
import ImportResults from './ImportResults.svelte';

beforeEach(() => {
	overwriteGetLocale(() => 'en');
});

function makeResult(rows: Array<{ row: number; status: 'success' | 'error' | 'skipped'; error?: string }>) {
	return {
		imported: rows.filter((r) => r.status === 'success').length,
		rows
	};
}

describe('ImportResults', () => {
	it('should show success count text', async () => {
		const importResult = makeResult([
			{ row: 1, status: 'success' },
			{ row: 2, status: 'success' },
			{ row: 3, status: 'error', error: 'Bad row' }
		]);

		render(ImportResults, { importResult, onreset: () => {}, onclose: () => {} });

		// "2 succeeded"
		await expect.element(page.getByText('2 succeeded')).toBeInTheDocument();
	});

	it('should show error count when errors exist', async () => {
		const importResult = makeResult([
			{ row: 1, status: 'success' },
			{ row: 2, status: 'error', error: 'Bad data' }
		]);

		render(ImportResults, { importResult, onreset: () => {}, onclose: () => {} });

		// "1 failed"
		await expect.element(page.getByText('1 failed')).toBeInTheDocument();
	});

	it('should have expandable failed rows section', async () => {
		const importResult = makeResult([
			{ row: 1, status: 'success' },
			{ row: 2, status: 'error', error: 'Invalid format' }
		]);

		render(ImportResults, { importResult, onreset: () => {}, onclose: () => {} });

		// Failed rows button should exist
		const toggleBtn = page.getByText(/Failed Rows/);
		await expect.element(toggleBtn).toBeInTheDocument();

		// Error details should not be visible before expanding
		await expect.element(page.getByText('Invalid format')).not.toBeInTheDocument();

		// Click to expand
		await toggleBtn.click();

		// Now the error detail should be visible
		await expect.element(page.getByText('Invalid format')).toBeInTheDocument();
	});

	it('should show progress bar', async () => {
		const importResult = makeResult([
			{ row: 1, status: 'success' },
			{ row: 2, status: 'success' }
		]);

		const { container } = render(ImportResults, { importResult, onreset: () => {}, onclose: () => {} });

		// Progress bar: the outer container with bg-secondary and inner with bg-green-500
		const progressBar = container.querySelector('.bg-green-500');
		expect(progressBar).not.toBeNull();
	});
});
