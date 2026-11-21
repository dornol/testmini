import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type SubmitFn = (input: { cancel: () => void }) => unknown;
const mocks = vi.hoisted(() => ({ submit: null as SubmitFn | null }));

// Capture the form's submit callback so tests can feed it server results.
vi.mock('$app/forms', () => ({
	enhance: (_form: HTMLFormElement, fn: SubmitFn) => {
		mocks.submit = fn;
		return { destroy() {} };
	}
}));

import { overwriteGetLocale } from '$lib/paraglide/runtime.js';
import BrandingPage from '../+page.svelte';

// Pages only read their own load data, so tests pass a minimal `data` object.
function view(config: Record<string, unknown> | null = null) {
	return render(BrandingPage, { props: { data: { config } } as never });
}

const file = (name: string, type: string, bytes = 1024) =>
	new File([new Uint8Array(bytes)], name, { type });
const fileInput = (name: 'logo' | 'favicon') =>
	document.querySelector(`input[type=file][name=${name}]`) as HTMLInputElement;
const hidden = (name: string) =>
	(document.querySelector(`input[type=hidden][name=${name}]`) as HTMLInputElement).value;

// The picker normally filters by `accept`; turn that off to exercise our own checks.
const user = () => userEvent.setup({ applyAccept: false });

beforeEach(() => {
	overwriteGetLocale(() => 'en');
	vi.clearAllMocks();
});

describe('admin branding page', () => {
	it('tells the two upload buttons apart', () => {
		view();
		expect(screen.getByRole('button', { name: 'Upload Logo' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Upload Favicon' })).toBeTruthy();
	});

	it('only offers formats the server accepts (no SVG) and states the limits', () => {
		view();
		for (const name of ['logo', 'favicon'] as const)
			expect(fileInput(name).accept).not.toContain('svg');
		expect(screen.getByText(/PNG, JPEG, WebP · up to 2 MB/)).toBeTruthy();
		expect(screen.getByText(/PNG, ICO · up to 2 MB/)).toBeTruthy();
	});

	it('requires an app name of at most 100 characters', () => {
		view();
		const name = screen.getByLabelText('Application Name') as HTMLInputElement;
		expect(name.required).toBe(true);
		expect(name.maxLength).toBe(100);
	});

	it('rejects an unsupported file before uploading and clears the picker', async () => {
		view();
		await user().upload(fileInput('logo'), file('logo.svg', 'image/svg+xml'));
		expect((await screen.findByRole('alert')).textContent).toContain('Unsupported file type');
		expect(fileInput('logo').files).toHaveLength(0);
	});

	it('rejects an oversized file naming it and its size', async () => {
		view();
		await user().upload(fileInput('logo'), file('big.png', 'image/png', 3 * 1024 * 1024));
		const alert = await screen.findByRole('alert');
		expect(alert.textContent).toContain('too large');
		expect(alert.textContent).toContain('big.png');
		expect(alert.textContent).toContain('3.0 MB');
	});

	it('announces a picked file as unsaved and shows its preview', async () => {
		view();
		await user().upload(fileInput('logo'), file('brand.png', 'image/png', 2048));
		expect(screen.getAllByRole('status')[0].textContent).toContain('brand.png (2 KB)');
		expect(screen.getAllByRole('status')[0].textContent).toContain('applied when you save');
		expect(await screen.findByAltText('New Logo preview')).toBeTruthy();
	});

	it('shows the current image with a localized alt text', () => {
		view({ appName: 'Acme', logoUrl: '/api/branding/logo.png', faviconUrl: null });
		expect(screen.getByAltText('Current Logo')).toBeTruthy();
		expect(screen.getByAltText('Default Favicon')).toBeTruthy();
	});

	it('removes a saved image only on save, says so, and can undo', async () => {
		view({ appName: 'Acme', logoUrl: '/api/branding/logo.png', faviconUrl: null });
		await userEvent.click(screen.getByRole('button', { name: 'Remove Logo' }));
		expect(hidden('removeLogo')).toBe('true');
		expect(screen.getAllByRole('status')[0].textContent).toContain('will be removed when you save');

		await userEvent.click(screen.getByRole('button', { name: 'Undo remove' }));
		expect(hidden('removeLogo')).toBe('false');
		expect(screen.getByAltText('Current Logo')).toBeTruthy();
	});

	it('drops a picked file when removing, so it is not uploaded with the removal', async () => {
		view({ appName: 'Acme', logoUrl: '/api/branding/logo.png', faviconUrl: null });
		await user().upload(fileInput('logo'), file('brand.png', 'image/png'));
		await screen.findByAltText('New Logo preview');
		await userEvent.click(screen.getByRole('button', { name: 'Remove Logo' }));
		expect(fileInput('logo').files).toHaveLength(0);
		expect(hidden('removeLogo')).toBe('true');
	});

	it('ties a server error to its field and focuses the error summary', async () => {
		view();
		const callback = (await mocks.submit!({ cancel: vi.fn() })) as (arg: {
			result: unknown;
		}) => Promise<void>;
		await callback({
			result: { type: 'failure', status: 400, data: { error: 'Invalid favicon file type' } }
		});
		const summary = await waitFor(() => {
			const el = document.querySelector('[data-slot=form-error-summary]');
			expect(el).toBeTruthy();
			return el!;
		});
		expect(summary.textContent).toContain('Unsupported file type. Use PNG, ICO.');
		await waitFor(() => expect(document.activeElement).toBe(summary));
		expect(summary.querySelector('a')?.getAttribute('href')).toBe('#favicon-upload');
	});
});
