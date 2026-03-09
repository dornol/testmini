import { page } from 'vitest/browser';
import { describe, expect, it, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { overwriteGetLocale } from '$lib/paraglide/runtime.js';
import GherkinEditor from './GherkinEditor.svelte';

beforeEach(() => {
	overwriteGetLocale(() => 'en');
});

describe('GherkinEditor', () => {
	it('should render a textarea', async () => {
		render(GherkinEditor, { value: '', onchange: () => {} });

		const textarea = page.getByRole('textbox');
		await expect.element(textarea).toBeInTheDocument();
	});

	it('should show preview when gherkin text is provided', async () => {
		render(GherkinEditor, {
			value: 'Given a user exists\nWhen the user logs in\nThen the user sees the dashboard',
			onchange: () => {}
		});

		// Preview section shows "Parsed Steps (3)"
		await expect.element(page.getByText(/Parsed Steps/)).toBeInTheDocument();

		// Individual steps should be visible
		await expect.element(page.getByText('a user exists')).toBeInTheDocument();
		await expect.element(page.getByText('the user logs in')).toBeInTheDocument();
		await expect.element(page.getByText('the user sees the dashboard')).toBeInTheDocument();
	});

	it('should not show preview when value is empty', async () => {
		render(GherkinEditor, { value: '', onchange: () => {} });

		await expect.element(page.getByText(/Parsed Steps/)).not.toBeInTheDocument();
	});

	it('should color-code Given, When, Then keywords', async () => {
		const { container } = render(GherkinEditor, {
			value: 'Given a precondition\nWhen an action\nThen a result',
			onchange: () => {}
		});

		const keywords = container.querySelectorAll('.font-bold');
		expect(keywords.length).toBe(3);

		const givenEl = Array.from(keywords).find((el) => el.textContent === 'Given') as HTMLElement;
		const whenEl = Array.from(keywords).find((el) => el.textContent === 'When') as HTMLElement;
		const thenEl = Array.from(keywords).find((el) => el.textContent === 'Then') as HTMLElement;

		expect(givenEl).not.toBeUndefined();
		expect(whenEl).not.toBeUndefined();
		expect(thenEl).not.toBeUndefined();

		// Given = blue, When = amber, Then = green
		expect(givenEl.classList.contains('text-blue-600')).toBe(true);
		expect(whenEl.classList.contains('text-amber-600')).toBe(true);
		expect(thenEl.classList.contains('text-green-600')).toBe(true);
	});
});
