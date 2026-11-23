import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$app/state', () => ({
	page: { url: new URL('http://localhost/projects/7/test-runs') }
}));

import { goto } from '$app/navigation';
import { overwriteGetLocale } from '$lib/paraglide/runtime.js';
import RunsPage from '../+page.svelte';

const run = (id: number, name: string) => ({
	id,
	name,
	environment: 'staging',
	status: 'IN_PROGRESS',
	createdBy: 'pat',
	createdAt: new Date('2026-01-01'),
	passedCount: 1,
	totalCount: 4,
	retestOfRunId: null
});

// Pages only read their own load data, so tests pass a minimal `data` object.
function view(over: Record<string, unknown> = {}) {
	const data = {
		project: { id: 7 },
		userRole: 'QA',
		statusFilter: '',
		projectEnvironments: [],
		runs: [run(1, 'Nightly 1'), run(2, 'Nightly 2'), run(3, 'Nightly 3')],
		meta: { page: 1, totalPages: 1 },
		...over
	};
	return render(RunsPage, { props: { data } as never });
}

const checkbox = (name: string) => screen.getByRole('checkbox', { name: `Compare: ${name}` });

beforeEach(() => {
	overwriteGetLocale(() => 'en');
	document.body.style.pointerEvents = '';
	vi.clearAllMocks();
});

describe('test run list: comparing runs', () => {
	it('shows the compare checkbox at every width (it used to be hidden below 640px)', () => {
		view();
		for (const el of screen.getAllByRole('checkbox')) {
			// Tailwind hides with `hidden` / `sm:table-cell`; neither may sit on the cell or its row.
			for (
				let node: Element | null = el;
				node && node.tagName !== 'TABLE';
				node = node.parentElement
			)
				expect(node.className).not.toMatch(/(^|\s)(hidden|sm:table-cell)(\s|$)/);
		}
	});

	it('gives each checkbox a 40px touch target through its label', () => {
		view();
		const label = checkbox('Nightly 1').closest('label');
		expect(label?.className).toContain('size-10');
	});

	it('announces the selection and says when two runs are ready to compare', async () => {
		view();
		const status = () => screen.getByRole('status');
		expect(status().textContent?.trim()).toBe('');

		await userEvent.click(checkbox('Nightly 1'));
		expect(status().textContent).toContain('Select exactly 2');

		await userEvent.click(checkbox('Nightly 2'));
		expect(status().textContent).toBe('Ready to compare Nightly 1 with Nightly 2.');
	});

	it('names the runs when a third pick replaces the oldest, instead of doing it silently', async () => {
		view();
		await userEvent.click(checkbox('Nightly 1'));
		await userEvent.click(checkbox('Nightly 2'));
		await userEvent.click(checkbox('Nightly 3'));
		expect(screen.getByRole('status').textContent).toBe(
			'Ready to compare Nightly 2 with Nightly 3.'
		);
		expect((checkbox('Nightly 1') as HTMLInputElement).checked).toBe(false);
	});

	it('opens the comparison with the two selected runs', async () => {
		view();
		await userEvent.click(checkbox('Nightly 2'));
		await userEvent.click(checkbox('Nightly 3'));
		await userEvent.click(screen.getByRole('button', { name: 'Compare' }));
		expect(goto).toHaveBeenCalledWith('/projects/7/test-runs/compare?runA=2&runB=3');
	});

	it('labels the otherwise empty checkbox column for screen readers', () => {
		view();
		const header = screen.getAllByRole('columnheader')[0];
		expect(within(header).getByText('Compare')).toBeTruthy();
	});
});

describe('test run list: pagination', () => {
	it('is a labelled navigation and uses the translated page counter', () => {
		view({ meta: { page: 2, totalPages: 5 } });
		const nav = screen.getByRole('navigation', { name: /pagination|page/i });
		expect(within(nav).getByText('2 / 5')).toBeTruthy();
		expect(within(nav).queryByText(/Page 2 of 5/)).toBeNull();
	});
});
