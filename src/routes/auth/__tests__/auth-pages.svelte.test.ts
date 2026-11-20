import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	signIn: vi.fn(),
	signOut: vi.fn(),
	pageState: { url: new URL('http://localhost/auth/login') }
}));

vi.mock('$lib/auth-client', () => ({
	authClient: { signIn: { email: mocks.signIn }, signOut: mocks.signOut }
}));
vi.mock('$app/state', () => ({ page: mocks.pageState }));
vi.mock('$app/forms', () => ({ enhance: () => ({ destroy() {} }) }));

import { invalidateAll } from '$app/navigation';
import { overwriteGetLocale } from '$lib/paraglide/runtime.js';
import LoginPage from '../login/+page.svelte';
import PendingPage from '../pending/+page.svelte';
import AccountPage from '../account/+page.svelte';

// Pages only read their own load data, so tests pass a minimal `data` object.
const withData = (data: object) => ({ props: { data } as never });

beforeEach(() => {
	overwriteGetLocale(() => 'en');
	vi.clearAllMocks();
	mocks.pageState.url = new URL('http://localhost/auth/login');
});

describe('login page', () => {
	const props = withData({ providers: [] });

	it('exposes password-manager hints and a password visibility toggle', async () => {
		render(LoginPage, props);
		const password = screen.getByLabelText('Password') as HTMLInputElement;
		expect(screen.getByLabelText('Email').getAttribute('autocomplete')).toBe('username');
		expect(password.getAttribute('autocomplete')).toBe('current-password');
		expect(password.type).toBe('password');

		const toggle = screen.getByRole('button', { name: 'Show password' });
		await userEvent.click(toggle);
		expect(password.type).toBe('text');
		expect(toggle.getAttribute('aria-pressed')).toBe('true');
	});

	it('shows a recovery message when SSO sign-in failed', () => {
		mocks.pageState.url = new URL('http://localhost/auth/login?error=oidc_callback_error');
		render(LoginPage, props);
		expect(screen.getByRole('alert').textContent).toContain('SSO sign-in failed');
	});

	it('shows an inline error, keeps the email and moves focus to it on bad credentials', async () => {
		mocks.signIn.mockResolvedValue({ error: { status: 401, message: 'Invalid' } });
		render(LoginPage, props);
		await userEvent.type(screen.getByLabelText('Email'), 'a@example.com');
		await userEvent.type(screen.getByLabelText('Password'), 'wrong');
		await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

		const alert = await screen.findByRole('alert');
		expect(alert.textContent).toContain('Invalid email or password');
		await waitFor(() => expect(document.activeElement).toBe(alert));
		expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('a@example.com');
		expect((screen.getByRole('button', { name: 'Sign in' }) as HTMLButtonElement).disabled).toBe(
			false
		);
	});

	it('recovers from a network failure instead of staying in the loading state', async () => {
		mocks.signIn.mockRejectedValue(new Error('network'));
		render(LoginPage, props);
		await userEvent.type(screen.getByLabelText('Email'), 'a@example.com');
		await userEvent.type(screen.getByLabelText('Password'), 'secret');
		await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

		expect((await screen.findByRole('alert')).textContent).toContain('Could not sign in');
		expect((screen.getByRole('button', { name: 'Sign in' }) as HTMLButtonElement).disabled).toBe(
			false
		);
	});
});

describe('pending approval page', () => {
	const props = withData({ userName: 'Pat', userEmail: 'pat@example.com' });

	it('announces that the account is still pending after a status check', async () => {
		vi.mocked(invalidateAll).mockResolvedValue();
		render(PendingPage, props);
		await userEvent.click(screen.getByRole('button', { name: 'Check Status' }));
		await waitFor(() =>
			expect(screen.getByRole('status').textContent).toContain('Not approved yet')
		);
	});

	it('shows an error when the status check fails', async () => {
		vi.mocked(invalidateAll).mockRejectedValue(new Error('offline'));
		render(PendingPage, props);
		await userEvent.click(screen.getByRole('button', { name: 'Check Status' }));
		expect((await screen.findByRole('alert')).textContent).toContain('Could not check');
	});

	it('shows an error and re-enables the button when sign out fails', async () => {
		mocks.signOut.mockRejectedValue(new Error('offline'));
		render(PendingPage, props);
		const logout = screen.getByRole('button', { name: /log ?out|sign out/i }) as HTMLButtonElement;
		await userEvent.click(logout);
		expect((await screen.findByRole('alert')).textContent).toContain('Could not sign out');
		expect(logout.disabled).toBe(false);
	});
});

describe('linked accounts page', () => {
	const account = {
		id: 7,
		externalId: 'sub-7',
		email: 'pat@sso.example.com',
		name: 'Pat',
		providerName: 'Acme SSO',
		providerSlug: 'acme',
		providerIconUrl: null
	};
	const base = { linkedAccounts: [account], availableProviders: [], hasPassword: true };

	it('asks for confirmation, naming the provider, before unlinking', async () => {
		render(AccountPage, withData(base));
		await userEvent.click(screen.getByRole('button', { name: 'Unlink Acme SSO' }));

		const dialog = await screen.findByRole('alertdialog');
		expect(dialog.textContent).toContain('Unlink Acme SSO?');

		await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
	});

	it('blocks unlinking the last sign-in method and says why', () => {
		render(AccountPage, withData({ ...base, hasPassword: false }));
		expect(
			(screen.getByRole('button', { name: 'Unlink Acme SSO' }) as HTMLButtonElement).disabled
		).toBe(true);
		expect(screen.getByText(/cannot be unlinked/i)).toBeTruthy();
	});

	it('shows a clear empty state and a way back', () => {
		render(AccountPage, withData({ ...base, linkedAccounts: [] }));
		expect(screen.getByText('No linked accounts.')).toBeTruthy();
		expect(screen.getByRole('link', { name: 'Back to projects' }).getAttribute('href')).toBe(
			'/projects'
		);
	});
});
