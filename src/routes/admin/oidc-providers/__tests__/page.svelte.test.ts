import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$app/forms', () => ({ enhance: () => ({ destroy() {} }) }));

import { overwriteGetLocale } from '$lib/paraglide/runtime.js';
import ProvidersPage from '../+page.svelte';

const provider = (over: Record<string, unknown> = {}) => ({
	id: 1,
	name: 'Acme SSO',
	slug: 'acme',
	providerType: 'OIDC',
	enabled: true,
	displayOrder: 0,
	createdAt: new Date('2026-01-01'),
	accountCount: 0,
	...over
});

// Pages only read their own load data, so tests pass a minimal `data` object.
const view = (providers: unknown[]) =>
	render(ProvidersPage, { props: { data: { providers } } as never });

beforeEach(() => {
	// A dialog left open by a previous test locks pointer events on <body>.
	document.body.style.pointerEvents = '';
	overwriteGetLocale(() => 'en');
	vi.clearAllMocks();
});

describe('admin OIDC providers page', () => {
	it('labels each action with the provider name and the action, not just the state', () => {
		view([provider()]);
		expect(screen.getAllByRole('button', { name: 'Disable Acme SSO' }).length).toBeGreaterThan(0);
		expect(screen.getAllByRole('button', { name: 'Delete Acme SSO' }).length).toBeGreaterThan(0);
		expect(screen.getAllByRole('link', { name: 'Edit Acme SSO' }).length).toBeGreaterThan(0);
	});

	it('asks for confirmation before disabling, warning about lost access', async () => {
		view([provider()]);
		await userEvent.click(screen.getAllByRole('button', { name: 'Disable Acme SSO' })[0]);

		const dialog = await screen.findByRole('alertdialog');
		expect(dialog.textContent).toContain('Disable "Acme SSO"?');
		expect(dialog.textContent).toContain('may lose access');

		await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
	});

	it('offers enabling for a disabled provider', async () => {
		view([provider({ enabled: false })]);
		await userEvent.click(screen.getAllByRole('button', { name: 'Enable Acme SSO' })[0]);
		expect((await screen.findByRole('alertdialog')).textContent).toContain('Enable "Acme SSO"?');
	});

	it('says a provider with linked accounts is disabled, and labels the button accordingly', async () => {
		view([provider({ accountCount: 2 })]);
		await userEvent.click(screen.getAllByRole('button', { name: 'Delete Acme SSO' })[0]);

		const dialog = await screen.findByRole('alertdialog');
		expect(dialog.textContent).toContain('disabled instead of deleted');
		const buttons = Array.from(dialog.querySelectorAll('button')).map((b) => b.textContent?.trim());
		expect(buttons).toContain('Disable');
		expect(buttons).not.toContain('Delete');
	});

	it('keeps the delete button for a provider without linked accounts', async () => {
		view([provider()]);
		await userEvent.click(screen.getAllByRole('button', { name: 'Delete Acme SSO' })[0]);
		const dialog = await screen.findByRole('alertdialog');
		const buttons = Array.from(dialog.querySelectorAll('button')).map((b) => b.textContent?.trim());
		expect(buttons).toContain('Delete');
	});

	it('shows an empty state with an add action and no empty table', () => {
		view([]);
		expect(screen.getByText('No identity providers configured.')).toBeTruthy();
		expect(screen.queryByRole('table')).toBeNull();
		expect(screen.getAllByRole('link', { name: /add provider/i }).length).toBeGreaterThan(0);
	});
});
