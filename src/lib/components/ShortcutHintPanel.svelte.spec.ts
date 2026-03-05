import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ShortcutHintPanel from './ShortcutHintPanel.svelte';
import {
	ShortcutManager,
	SHORTCUTS_CONTEXT_KEY,
	type ShortcutsContext,
} from '$lib/shortcuts';

/**
 * Build a minimal ShortcutsContext backed by a fresh ShortcutManager.
 * Pre-populate it with shortcuts when provided.
 */
function makeContext(manager = new ShortcutManager()): ShortcutsContext {
	return {
		register: (combo, def) => manager.register(combo, def),
		manager,
	};
}

/**
 * Helper: render ShortcutHintPanel with Svelte context injected.
 */
function renderPanel(props: { open: boolean }, ctx: ShortcutsContext = makeContext()) {
	return render(ShortcutHintPanel, {
		props,
		context: new Map([[SHORTCUTS_CONTEXT_KEY, ctx]]),
	});
}

describe('ShortcutHintPanel', () => {
	it('should not render panel content when open is false', async () => {
		renderPanel({ open: false });

		// The dialog element is conditionally rendered — it must not be in the DOM
		const dialog = page.getByRole('dialog');
		await expect.element(dialog).not.toBeInTheDocument();
	});

	it('should render the panel when open is true', async () => {
		renderPanel({ open: true });

		const dialog = page.getByRole('dialog');
		await expect.element(dialog).toBeInTheDocument();
	});

	it('should render the "Keyboard Shortcuts" heading when open', async () => {
		renderPanel({ open: true });

		const heading = page.getByText('Keyboard Shortcuts');
		await expect.element(heading).toBeInTheDocument();
	});

	it('should render the close button when open', async () => {
		renderPanel({ open: true });

		const closeBtn = page.getByRole('button', { name: 'Close shortcuts panel' });
		await expect.element(closeBtn).toBeInTheDocument();
	});

	it('should render shortcuts list when open and shortcuts are registered', async () => {
		const manager = new ShortcutManager();
		manager.register('Mod+S', { label: 'Save', category: 'Actions', handler: () => {} });
		manager.register('Mod+K', { label: 'Command Palette', category: 'Navigation', handler: () => {} });
		manager.register('?', { label: 'Show Shortcuts', category: 'General', handler: () => {} });

		renderPanel({ open: true }, makeContext(manager));

		await expect.element(page.getByText('Save')).toBeInTheDocument();
		await expect.element(page.getByText('Command Palette')).toBeInTheDocument();
		await expect.element(page.getByText('Show Shortcuts')).toBeInTheDocument();
	});

	it('should render category headings for registered shortcuts', async () => {
		const manager = new ShortcutManager();
		manager.register('Mod+S', { label: 'Save', category: 'Actions', handler: () => {} });
		manager.register('Mod+K', { label: 'Go Home', category: 'Navigation', handler: () => {} });

		renderPanel({ open: true }, makeContext(manager));

		await expect.element(page.getByText('Actions')).toBeInTheDocument();
		await expect.element(page.getByText('Navigation')).toBeInTheDocument();
	});

	it('should not render empty category sections', async () => {
		const manager = new ShortcutManager();
		// Only register an Actions shortcut — Navigation and General sections should be absent
		manager.register('Mod+S', { label: 'Save', category: 'Actions', handler: () => {} });

		renderPanel({ open: true }, makeContext(manager));

		// "Actions" should appear, but "Navigation" and "General" headings should not
		await expect.element(page.getByText('Actions')).toBeInTheDocument();
		await expect.element(page.getByText('Navigation')).not.toBeInTheDocument();
		await expect.element(page.getByText('General')).not.toBeInTheDocument();
	});

	it('should render the Esc hint in the footer when open', async () => {
		renderPanel({ open: true });

		const escHint = page.getByText(/click outside to close/i);
		await expect.element(escHint).toBeInTheDocument();
	});

	it('should render an empty panel (no category sections) when no shortcuts are registered', async () => {
		renderPanel({ open: true });

		// No category headings should appear since no shortcuts are registered
		await expect.element(page.getByText('Navigation')).not.toBeInTheDocument();
		await expect.element(page.getByText('Actions')).not.toBeInTheDocument();
		await expect.element(page.getByText('General')).not.toBeInTheDocument();
	});
});
