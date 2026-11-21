import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type SubmitFn = (input: { cancel: () => void }) => unknown;
const mocks = vi.hoisted(() => ({ handlers: {} as Record<string, SubmitFn> }));

// Capture each form's submit callback so tests can feed it server results.
vi.mock('$app/forms', () => ({
	enhance: (form: HTMLFormElement, fn: SubmitFn) => {
		mocks.handlers[form.getAttribute('action') ?? ''] = fn;
		return { destroy() {} };
	}
}));

import { apiPut } from '$lib/api-client';
import { overwriteGetLocale } from '$lib/paraglide/runtime.js';
import ProfilePage from '../+page.svelte';

function view(over: Record<string, unknown> = {}) {
	const data = {
		userData: {
			id: 'u1',
			name: 'Pat',
			email: 'pat@example.com',
			createdAt: new Date('2026-01-01')
		},
		hasPassword: true,
		linkedAccounts: [],
		availableProviders: [],
		preferences: { locale: null, theme: null, notificationSettings: null },
		...over
	};
	// Pages only read their own load data, so tests pass a minimal `data` object.
	return render(ProfilePage, { props: { data } as never });
}

const field = (label: string | RegExp) => screen.getByLabelText(label) as HTMLInputElement;

/** Run a form's enhance callback as SvelteKit would; returns whether the request was cancelled. */
async function submitForm(action: string, result?: Record<string, unknown>) {
	const cancel = vi.fn();
	const callback = (await mocks.handlers[action]({ cancel })) as
		((arg: { result: unknown }) => Promise<void>) | undefined;
	if (callback && result) await callback({ result });
	return { cancelled: cancel.mock.calls.length > 0 };
}

beforeEach(() => {
	overwriteGetLocale(() => 'en');
	document.body.style.pointerEvents = '';
	vi.clearAllMocks();
});

describe('profile page: password', () => {
	it('gives password managers the right hints and requires every field', () => {
		view();
		expect(field('Current Password').getAttribute('autocomplete')).toBe('current-password');
		expect(field('New Password').getAttribute('autocomplete')).toBe('new-password');
		expect(field('Confirm New Password').getAttribute('autocomplete')).toBe('new-password');
		for (const label of ['Current Password', 'New Password', 'Confirm New Password']) {
			expect(field(label).required).toBe(true);
			expect(field(label).maxLength).toBe(1024);
		}
	});

	it('states the length rule next to the new password', () => {
		view();
		const hint = document.getElementById('newPassword-hint');
		expect(hint?.textContent).toContain('at least 8 characters');
		expect(field('New Password').getAttribute('aria-describedby')).toContain('newPassword-hint');
	});

	it('reveals all three password fields with one toggle', async () => {
		view();
		await userEvent.click(screen.getByLabelText('Show password'));
		for (const label of ['Current Password', 'New Password', 'Confirm New Password'])
			expect(field(label).type).toBe('text');
	});

	it('rejects a short new password before any request and focuses the field', async () => {
		view();
		await userEvent.type(field('Current Password'), 'old-password');
		await userEvent.type(field('New Password'), 'short');
		await userEvent.type(field('Confirm New Password'), 'short');
		const { cancelled } = await submitForm('?/changePassword');

		expect(cancelled).toBe(true);
		await waitFor(() => expect(field('New Password').getAttribute('aria-invalid')).toBe('true'));
		expect(document.getElementById('newPassword-error')?.textContent).toContain('at least 8');
		await waitFor(() => expect(document.activeElement).toBe(field('New Password')));
	});

	it('rejects a mismatched confirmation on the confirmation field', async () => {
		view();
		await userEvent.type(field('Current Password'), 'old-password');
		await userEvent.type(field('New Password'), 'new-password-1');
		await userEvent.type(field('Confirm New Password'), 'new-password-2');
		const { cancelled } = await submitForm('?/changePassword');

		expect(cancelled).toBe(true);
		await waitFor(() =>
			expect(field('Confirm New Password').getAttribute('aria-invalid')).toBe('true')
		);
		expect(document.getElementById('confirmPassword-error')?.textContent).toContain('do not match');
	});

	it('shows a wrong current password on that field, not just in a toast', async () => {
		view();
		await userEvent.type(field('Current Password'), 'wrong-password');
		await userEvent.type(field('New Password'), 'new-password-1');
		await userEvent.type(field('Confirm New Password'), 'new-password-1');
		const { cancelled } = await submitForm('?/changePassword', {
			type: 'failure',
			status: 400,
			data: { passwordError: 'password_wrong' }
		});

		expect(cancelled).toBe(false);
		await waitFor(() =>
			expect(field('Current Password').getAttribute('aria-invalid')).toBe('true')
		);
		await waitFor(() => expect(document.activeElement).toBe(field('Current Password')));
		expect(document.getElementById('currentPassword-error')?.textContent).toContain('incorrect');
		// What was typed is kept so the user only fixes the wrong field.
		expect(field('New Password').value).toBe('new-password-1');
	});

	it('shows an unexpected server error as a focused alert', async () => {
		view();
		await userEvent.type(field('Current Password'), 'old-password');
		await userEvent.type(field('New Password'), 'new-password-1');
		await userEvent.type(field('Confirm New Password'), 'new-password-1');
		await submitForm('?/changePassword', {
			type: 'failure',
			status: 500,
			data: { passwordError: 'Something internal broke' }
		});
		const alert = await screen.findByRole('alert');
		expect(alert.textContent).not.toContain('internal');
		await waitFor(() => expect(document.activeElement).toBe(alert));
	});

	it('hides the password section for accounts without a password', () => {
		view({ hasPassword: false });
		expect(screen.queryByLabelText('Current Password')).toBeNull();
	});
});

describe('profile page: name, preferences and notifications', () => {
	it('requires a name of at most 100 characters and explains a server rejection', async () => {
		view();
		const name = field('Display Name');
		expect(name.required).toBe(true);
		expect(name.maxLength).toBe(100);

		await submitForm('?/updateName', {
			type: 'failure',
			status: 400,
			data: { error: 'Name is required (1-100 characters)' }
		});
		await waitFor(() => expect(name.getAttribute('aria-invalid')).toBe('true'));
		expect(document.getElementById('displayName-error')?.textContent).toContain('1–100');
	});

	it('lets screen reader users tell the identical "Save Changes" buttons apart', () => {
		view();
		const buttons = screen.getAllByRole('button', { name: 'Save Changes' });
		expect(buttons).toHaveLength(3);
		const described = buttons.map((b) => {
			const id = b.getAttribute('aria-describedby');
			return id ? document.getElementById(id)?.textContent?.trim() : undefined;
		});
		expect(described).toEqual(['Account Information', 'Preferences', 'Notification Preferences']);
	});

	it('labels the language and theme selects', () => {
		view();
		expect(screen.getByLabelText('Language').tagName).toBe('SELECT');
		expect(screen.getByLabelText('Theme').tagName).toBe('SELECT');
	});

	it('saves the notification types the user turned off', async () => {
		view();
		await userEvent.click(screen.getByRole('checkbox', { name: 'Mentioned in comment' }));
		const save = screen.getByRole('button', { name: 'Save Changes', description: /Notification/ });
		await userEvent.click(save);
		expect(apiPut).toHaveBeenCalledWith('/api/users/me/preferences', {
			notificationSettings: { enableInApp: true, mutedTypes: ['MENTION'] }
		});
	});

	it('shows the account details as a definition list', () => {
		view();
		expect(screen.getByText('pat@example.com').tagName).toBe('DD');
	});
});

describe('profile page: connected accounts', () => {
	it('reuses the shared linked-accounts card, with a clear empty state', () => {
		view();
		expect(screen.getByRole('heading', { level: 2, name: 'Connected Accounts' })).toBeTruthy();
		expect(screen.getByText('No linked accounts.')).toBeTruthy();
	});
});
