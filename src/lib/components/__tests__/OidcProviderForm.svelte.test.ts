import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type SubmitFn = (input: { cancel: () => void }) => unknown;
const mocks = vi.hoisted(() => ({
	handlers: {} as Record<string, SubmitFn>
}));

vi.mock('$app/state', () => ({
	page: { url: new URL('https://app.example.com/admin/oidc-providers/new') }
}));
// Capture each form's submit callback so tests can feed it server results.
vi.mock('$app/forms', () => ({
	enhance: (form: HTMLFormElement, fn: SubmitFn) => {
		mocks.handlers[form.getAttribute('action') ?? ''] = fn;
		return { destroy() {} };
	}
}));

import { apiPost } from '$lib/api-client';
import { overwriteGetLocale } from '$lib/paraglide/runtime.js';
import OidcProviderForm from '../OidcProviderForm.svelte';

const provider = {
	name: 'Acme SSO',
	slug: 'acme',
	providerType: 'OIDC',
	clientId: 'client-1',
	issuerUrl: 'https://idp.example.com',
	jwksUri: 'https://idp.example.com/jwks',
	authorizationUrl: 'https://idp.example.com/authorize',
	tokenUrl: 'https://idp.example.com/token',
	userinfoUrl: null,
	scopes: 'openid profile email',
	autoRegister: false,
	iconUrl: null,
	displayOrder: 2
};

const input = (label: string | RegExp) => screen.getByLabelText(label) as HTMLInputElement;

/** Run the form's enhance callback as SvelteKit would, with a given server result. */
async function submitWith(action: string, result: Record<string, unknown>) {
	const callback = (await mocks.handlers[action]({ cancel: vi.fn() })) as (arg: {
		result: unknown;
	}) => Promise<void>;
	await callback({ result });
}

beforeEach(() => {
	overwriteGetLocale(() => 'en');
	document.body.style.pointerEvents = '';
	vi.clearAllMocks();
});

describe('OidcProviderForm (create)', () => {
	it('derives the slug and the redirect URI from the name', async () => {
		render(OidcProviderForm);
		await userEvent.type(input(/^Display Name/), 'Corp Keycloak');
		expect(input(/^Slug/).value).toBe('corp-keycloak');
		expect(input('Redirect URI').value).toBe(
			'https://app.example.com/auth/oidc/corp-keycloak/callback'
		);
	});

	it('requires the client secret and keeps password managers from filling it', () => {
		render(OidcProviderForm);
		const secret = input(/^Client Secret/);
		expect(secret.required).toBe(true);
		expect(secret.getAttribute('autocomplete')).toBe('new-password');
	});

	it('ties a duplicate-slug server error to the slug field and the error summary', async () => {
		render(OidcProviderForm);
		await submitWith('?/create', {
			type: 'failure',
			status: 400,
			data: { error: 'A provider with this slug already exists' }
		});

		await waitFor(() => expect(input(/^Slug/).getAttribute('aria-invalid')).toBe('true'));
		expect(input(/^Slug/).getAttribute('aria-describedby')).toContain('slug-error');
		expect(document.getElementById('slug-error')?.textContent).toContain('already in use');
		const summary = document.querySelector('[data-slot=form-error-summary]');
		expect(summary?.textContent).toContain('already in use');
		await waitFor(() => expect(document.activeElement).toBe(summary));
	});

	it('explains URL errors per field without leaking unknown server details', async () => {
		render(OidcProviderForm);
		await submitWith('?/create', {
			type: 'failure',
			status: 400,
			data: { error: 'tokenUrl: URL must use HTTPS' }
		});
		await waitFor(() => expect(input(/^Token URL/).getAttribute('aria-invalid')).toBe('true'));
		expect(document.getElementById('tokenUrl-error')?.textContent).toContain('URL must use HTTPS');
	});

	it('shows a generic message for unexpected server errors', async () => {
		render(OidcProviderForm);
		await submitWith('?/create', {
			type: 'failure',
			status: 500,
			data: { error: 'Failed to create OIDC provider: connect ECONNREFUSED 10.0.0.5' }
		});
		const summary = await waitFor(() => {
			const el = document.querySelector('[data-slot=form-error-summary]');
			expect(el).toBeTruthy();
			return el!;
		});
		expect(summary.textContent).not.toContain('10.0.0.5');
	});
});

describe('OidcProviderForm discovery', () => {
	it('fills the endpoints including the JWKS URI and keeps typed values it does not replace', async () => {
		vi.mocked(apiPost).mockResolvedValue({
			authorizationUrl: 'https://idp.example.com/auth',
			tokenUrl: 'https://idp.example.com/token',
			jwksUri: 'https://idp.example.com/jwks'
		} as never);
		render(OidcProviderForm);
		await userEvent.type(input(/^Userinfo URL/), 'https://idp.example.com/me');
		await userEvent.type(input(/^Issuer URL/), 'https://idp.example.com');
		await userEvent.click(screen.getByRole('button', { name: 'Auto-discover' }));

		await waitFor(() => expect(input(/^JWKS URI/).value).toBe('https://idp.example.com/jwks'));
		expect(input(/^Token URL/).value).toBe('https://idp.example.com/token');
		// The discovery response had no userinfo endpoint: the typed value must survive.
		expect(input(/^Userinfo URL/).value).toBe('https://idp.example.com/me');
		expect(screen.getByRole('status').textContent).toContain('discovered');
	});

	it('offers a way forward when discovery fails', async () => {
		vi.mocked(apiPost).mockRejectedValue(new Error('boom'));
		render(OidcProviderForm);
		await userEvent.type(input(/^Issuer URL/), 'https://idp.example.com');
		await userEvent.click(screen.getByRole('button', { name: 'Auto-discover' }));
		expect((await screen.findByRole('alert')).textContent).toContain('enter the endpoints');
	});
});

describe('OidcProviderForm (edit)', () => {
	it('submits the stored JWKS URI so saving does not wipe it', () => {
		render(OidcProviderForm, { props: { provider, accountCount: 0 } });
		const jwks = input(/^JWKS URI/);
		expect(jwks.value).toBe('https://idp.example.com/jwks');
		expect(jwks.name).toBe('jwksUri');
	});

	it('keeps the current secret when left empty', () => {
		render(OidcProviderForm, { props: { provider, accountCount: 0 } });
		const secret = input(/^Client Secret/);
		expect(secret.required).toBe(false);
		expect(secret.placeholder).toBe('Leave blank to keep current');
	});

	it('offers deletion with a confirmation naming the provider', async () => {
		render(OidcProviderForm, { props: { provider, accountCount: 0 } });
		await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
		const dialog = await screen.findByRole('alertdialog');
		expect(dialog.textContent).toContain('"Acme SSO"');
	});

	it('says a provider with linked accounts is disabled, and treats the server reply as success', async () => {
		render(OidcProviderForm, { props: { provider, accountCount: 3 } });
		await userEvent.click(screen.getByRole('button', { name: 'Disable' }));
		const dialog = await screen.findByRole('alertdialog');
		expect(dialog.textContent).toContain('disabled instead of deleted');

		await submitWith('?/deleteProvider', {
			type: 'failure',
			status: 400,
			data: { error: 'Provider has linked accounts. It has been disabled instead.' }
		});
		await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
		expect(screen.queryByRole('alert')).toBeNull();
	});
});
