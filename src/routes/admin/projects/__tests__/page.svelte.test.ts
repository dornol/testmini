import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$app/forms', () => ({ enhance: () => ({ destroy() {} }) }));

import { goto } from '$app/navigation';
import { overwriteGetLocale } from '$lib/paraglide/runtime.js';
import ProjectsPage from '../+page.svelte';

const project = (over: Record<string, unknown> = {}) => ({
	id: 1,
	name: 'Alpha',
	active: true,
	memberCount: 3,
	createdAt: new Date('2026-01-01'),
	...over
});

// Pages only read their own load data, so tests pass a minimal `data` object.
function view(over: Record<string, unknown> = {}) {
	const data = {
		projects: [project()],
		search: '',
		showInactive: false,
		pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
		...over
	};
	return render(ProjectsPage, { props: { data } as never });
}

beforeEach(() => {
	overwriteGetLocale(() => 'en');
	vi.clearAllMocks();
});

describe('admin projects page', () => {
	it('keeps the search term and inactive filter in pagination links, URL-encoded', () => {
		view({
			search: 'a&b #1',
			showInactive: true,
			pagination: { page: 2, limit: 20, total: 60, totalPages: 3 }
		});
		expect(screen.getByRole('link', { name: 'Previous' }).getAttribute('href')).toBe(
			'/admin/projects?search=a%26b+%231&inactive=true'
		);
		expect(screen.getByRole('link', { name: 'Next' }).getAttribute('href')).toBe(
			'/admin/projects?search=a%26b+%231&inactive=true&page=3'
		);
	});

	it('toggles the inactive filter as a pressed button without dropping the search term', async () => {
		view({ search: 'alpha' });
		const toggle = screen.getByRole('button', { name: 'Show Inactive' });
		expect(toggle.getAttribute('aria-pressed')).toBe('false');
		await userEvent.click(toggle);
		expect(goto).toHaveBeenCalledWith('/admin/projects?search=alpha&inactive=true');
	});

	it('names the row action after the project and confirms with the project name', async () => {
		view();
		await userEvent.click(screen.getAllByRole('button', { name: 'Deactivate Alpha' })[0]);

		const dialog = await screen.findByRole('alertdialog');
		expect(dialog.textContent).toContain('Deactivate "Alpha"?');

		await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
	});

	it('offers activation for an inactive project', async () => {
		view({ projects: [project({ active: false })] });
		await userEvent.click(screen.getAllByRole('button', { name: 'Activate Alpha' })[0]);
		expect((await screen.findByRole('alertdialog')).textContent).toContain('Activate "Alpha"?');
	});

	it('shows an empty state when nothing matches', () => {
		view({ projects: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } });
		expect(screen.getAllByText('No projects found.').length).toBeGreaterThan(0);
	});
});
