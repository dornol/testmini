import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { overwriteGetLocale } from '$lib/paraglide/runtime.js';
import ComparePage from '../+page.svelte';

const row = (over: Record<string, unknown> = {}) => ({
	testCaseId: 1,
	key: 'TC-1',
	title: 'Login works',
	priority: 'HIGH',
	statusA: 'PASS',
	statusB: 'PASS',
	...over
});

// Pages only read their own load data, so tests pass a minimal `data` object.
function view(rows: unknown[], over: Record<string, unknown> = {}) {
	const data = {
		project: { id: 7 },
		projectPriorities: [{ name: 'HIGH', color: '#ef4444' }],
		runA: { id: 11, name: 'Nightly 1', environment: 'staging', status: 'COMPLETED' },
		runB: { id: 12, name: 'Nightly 2', environment: 'staging', status: 'COMPLETED' },
		rows,
		summary: { same: 1, regression: 1, improvement: 1, changed: 1, onlyInA: 1, onlyInB: 1 },
		...over
	};
	return render(ComparePage, { props: { data } as never });
}

const rows = [
	row(),
	row({ testCaseId: 2, key: 'TC-2', title: 'Pay', statusA: 'PASS', statusB: 'FAIL' }),
	row({ testCaseId: 3, key: 'TC-3', title: 'Refund', statusA: 'FAIL', statusB: 'PASS' }),
	row({ testCaseId: 4, key: 'TC-4', title: 'Search', statusA: 'PASS', statusB: 'BLOCKED' }),
	row({ testCaseId: 5, key: 'TC-5', title: 'Old case', statusA: 'PASS', statusB: null }),
	row({ testCaseId: 6, key: 'TC-6', title: 'New case', statusA: null, statusB: 'PASS' })
];

beforeEach(() => {
	overwriteGetLocale(() => 'en');
	vi.clearAllMocks();
});

describe('test run comparison page', () => {
	it('spells out the kind of change in text instead of relying on row color', () => {
		view(rows);
		const table = screen.getByRole('table', { name: 'Run Comparison' });
		const text = (title: string) =>
			within(table).getByRole('link', { name: title }).closest('tr')!.textContent;
		expect(text('Pay')).toContain('Regression');
		expect(text('Refund')).toContain('Improvement');
		expect(text('Search')).toContain('Changed');
		expect(text('Login works')).toContain('Same');
		expect(text('Old case')).toContain('Only in A');
		expect(text('New case')).toContain('Only in B');
	});

	it('links cases and runs for navigation, with no dead buttons on the card list', () => {
		view(rows);
		expect(screen.getAllByRole('link', { name: 'Pay' })[0].getAttribute('href')).toBe(
			'/projects/7/test-cases/2'
		);
		expect(screen.getByRole('link', { name: 'Nightly 1' }).getAttribute('href')).toBe(
			'/projects/7/test-runs/11'
		);
		// The mobile list used to render focusable <button>s that did nothing.
		const list = screen.getByRole('list', { name: 'Run Comparison' });
		expect(list.querySelectorAll('button')).toHaveLength(0);
	});

	it('says a case is missing from a run, not just a dash', () => {
		view(rows);
		expect(screen.getAllByText('Not in this run').length).toBeGreaterThan(0);
	});

	it('filters rows, exposes the pressed filter and announces how many rows show', async () => {
		view(rows);
		expect(screen.getByRole('status').textContent).toContain('Showing 6 rows');

		const diff = screen.getByRole('button', { name: /^Diff/ });
		expect(diff.getAttribute('aria-pressed')).toBe('false');
		await userEvent.click(diff);
		expect(diff.getAttribute('aria-pressed')).toBe('true');
		expect(screen.getByRole('status').textContent).toContain('Showing 5 rows');
		expect(screen.queryByRole('link', { name: 'Login works' })).toBeNull();
	});

	it('shows the summary as a definition list with real numbers', () => {
		const { container } = view(rows);
		const stats = Array.from(container.querySelectorAll('dl dt')).map((dt) => [
			dt.textContent,
			dt.nextElementSibling?.textContent?.replace(/[^0-9]/g, '')
		]);
		// dt/dd must sit in a div directly under the dl (axe: definition-list / dlitem).
		for (const dt of container.querySelectorAll('dl dt'))
			expect(dt.parentElement?.parentElement?.tagName).toBe('DL');
		expect(stats).toContainEqual(['Regression', '1']);
		expect(stats).toContainEqual(['Same', '1']);
	});

	it('has distinct empty messages for no data and no differences', async () => {
		const { unmount } = view([], {
			summary: { same: 0, regression: 0, improvement: 0, changed: 0, onlyInA: 0, onlyInB: 0 }
		});
		expect(screen.getByText('There are no results to compare.')).toBeTruthy();
		expect((screen.getByRole('button', { name: 'Export CSV' }) as HTMLButtonElement).disabled).toBe(
			true
		);
		unmount();

		view([row()]);
		await userEvent.click(screen.getByRole('button', { name: /^Diff/ }));
		expect(screen.getByText('No differences found')).toBeTruthy();
	});
});

describe('test run comparison CSV export', () => {
	let blobs: Blob[];
	let download = '';

	beforeEach(() => {
		blobs = [];
		URL.createObjectURL = vi.fn((b: Blob) => (blobs.push(b), 'blob:x'));
		URL.revokeObjectURL = vi.fn();
		vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
			this: HTMLAnchorElement
		) {
			download = this.download;
		});
	});
	afterEach(() => vi.restoreAllMocks());

	it('neutralizes spreadsheet formulas in titles and includes the change column', async () => {
		view([
			row({ testCaseId: 9, key: 'TC-9', title: '=HYPERLINK("http://evil","x")', statusB: 'FAIL' })
		]);
		await userEvent.click(screen.getByRole('button', { name: 'Export CSV' }));

		const csv = await blobs[0].text();
		const [header, line] = csv.replace('﻿', '').split('\n');
		expect(header).toBe('"Key","Title","Priority","Run A Status","Run B Status","Change"');
		// Quotes are escaped and the formula prefix is defused.
		expect(line).toBe(
			`"TC-9","'=HYPERLINK(""http://evil"",""x"")","HIGH","PASS","FAIL","Regression"`
		);
	});

	it('exports only the filtered rows and uses a filesystem-safe name', async () => {
		view(rows, {
			runA: { id: 11, name: 'a/b: run', environment: 'x', status: 'COMPLETED' }
		});
		await userEvent.click(screen.getByRole('button', { name: /^Diff/ }));
		await userEvent.click(screen.getByRole('button', { name: 'Export CSV' }));

		const lines = (await blobs[0].text()).replace('﻿', '').split('\n');
		expect(lines).toHaveLength(1 + 5); // header + 5 differing rows
		expect(download).toBe('compare-a-b- run-vs-Nightly 2.csv');
	});
});
