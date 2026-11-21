import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$app/state', () => ({ page: { data: { user: { id: 'me' } } } }));
vi.mock('$app/forms', () => ({ enhance: () => ({ destroy() {} }) }));

import { goto } from '$app/navigation';
import { overwriteGetLocale } from '$lib/paraglide/runtime.js';
import UsersPage from '../+page.svelte';

const user = (over: Record<string, unknown> = {}) => ({
	id: 'u1',
	name: 'Pat',
	email: 'pat@example.com',
	role: 'user',
	approved: true,
	banned: false,
	banReason: null,
	createdAt: new Date('2026-01-01'),
	...over
});

// Pages only read their own load data, so tests pass a minimal `data` object.
function view(over: Record<string, unknown> = {}) {
	const data = {
		users: [user()],
		search: '',
		pendingOnly: false,
		pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
		...over
	};
	return render(UsersPage, { props: { data } as never });
}

beforeEach(() => {
	overwriteGetLocale(() => 'en');
	vi.clearAllMocks();
});

describe('admin users page', () => {
	it('keeps the search term and pending filter in pagination links, URL-encoded', () => {
		view({
			search: 'a&b #1',
			pendingOnly: true,
			pagination: { page: 2, limit: 20, total: 60, totalPages: 3 }
		});
		const prev = screen.getByRole('link', { name: 'Previous' }).getAttribute('href');
		const next = screen.getByRole('link', { name: 'Next' }).getAttribute('href');
		expect(prev).toBe('/admin/users?search=a%26b+%231&pending=true');
		expect(next).toBe('/admin/users?search=a%26b+%231&pending=true&page=3');
	});

	it('toggles the pending filter without dropping the search term', async () => {
		view({ search: 'pat' });
		const toggle = screen.getByRole('button', { name: 'Pending Only' });
		expect(toggle.getAttribute('aria-pressed')).toBe('false');
		await userEvent.click(toggle);
		expect(goto).toHaveBeenCalledWith('/admin/users?search=pat&pending=true');
	});

	it('names each row action after the user so identical buttons can be told apart', () => {
		view({ users: [user(), user({ id: 'u2', name: 'Kim' })] });
		expect(screen.getAllByRole('button', { name: 'Make Admin Pat' }).length).toBeGreaterThan(0);
		expect(screen.getAllByRole('button', { name: 'Make Admin Kim' }).length).toBeGreaterThan(0);
	});

	it('asks for confirmation before changing a role', async () => {
		view();
		await userEvent.click(screen.getAllByRole('button', { name: 'Make Admin Pat' })[0]);

		const dialog = await screen.findByRole('alertdialog');
		expect(dialog.textContent).toContain('Make Pat an administrator?');

		await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
	});

	it('offers an optional reason field when banning', async () => {
		view();
		await userEvent.click(screen.getAllByRole('button', { name: 'Ban Pat' })[0]);
		expect(await screen.findByLabelText(/reason/i)).toBeTruthy();
	});

	it('shows no actions on the signed-in admin’s own row', () => {
		view({ users: [user({ id: 'me', name: 'Me', role: 'admin' })] });
		expect(screen.getAllByText('You').length).toBeGreaterThan(0);
		expect(screen.queryByRole('button', { name: /Me$/ })).toBeNull();
	});

	it('shows the ban reason next to the banned status', () => {
		view({ users: [user({ banned: true, banReason: 'Spam' })] });
		expect(screen.getAllByText('Spam').length).toBeGreaterThan(0);
	});
});
