import { render, screen, fireEvent } from '@testing-library/svelte';
import { describe, it, expect, vi } from 'vitest';
import ShortcutHintPanelTest from './helpers/ShortcutHintPanelTest.svelte';
import { ShortcutManager } from '$lib/shortcuts';

function createManagerWithShortcuts() {
	const manager = new ShortcutManager();
	manager.register('Mod+K', {
		label: 'Open command palette',
		category: 'Navigation',
		handler: vi.fn()
	});
	manager.register('Mod+S', {
		label: 'Save changes',
		category: 'Actions',
		handler: vi.fn()
	});
	manager.register('?', {
		label: 'Show shortcuts',
		category: 'General',
		handler: vi.fn()
	});
	return manager;
}

describe('ShortcutHintPanel', () => {
	it('does not render when open=false', () => {
		const { container } = render(ShortcutHintPanelTest, {
			props: { open: false, manager: createManagerWithShortcuts() }
		});
		const dialog = container.querySelector('[role="dialog"]');
		expect(dialog).toBeNull();
	});

	it('renders dialog when open=true', () => {
		render(ShortcutHintPanelTest, {
			props: { open: true, manager: createManagerWithShortcuts() }
		});
		const dialog = screen.getByRole('dialog');
		expect(dialog).toBeTruthy();
		expect(dialog.getAttribute('aria-modal')).toBe('true');
		expect(dialog.getAttribute('aria-label')).toBe('Keyboard shortcuts');
	});

	it('shows "Keyboard Shortcuts" title', () => {
		render(ShortcutHintPanelTest, {
			props: { open: true, manager: createManagerWithShortcuts() }
		});
		expect(screen.getByText('Keyboard Shortcuts')).toBeTruthy();
	});

	it('groups shortcuts by category', () => {
		const { container } = render(ShortcutHintPanelTest, {
			props: { open: true, manager: createManagerWithShortcuts() }
		});

		// All three categories should be visible
		expect(screen.getByText('Navigation')).toBeTruthy();
		expect(screen.getByText('Actions')).toBeTruthy();
		expect(screen.getByText('General')).toBeTruthy();

		// Shortcut labels should appear
		expect(screen.getByText('Open command palette')).toBeTruthy();
		expect(screen.getByText('Save changes')).toBeTruthy();
		expect(screen.getByText('Show shortcuts')).toBeTruthy();
	});

	it('shows shortcut labels and formatted keys', () => {
		const { container } = render(ShortcutHintPanelTest, {
			props: { open: true, manager: createManagerWithShortcuts() }
		});

		// The '?' shortcut should render as a kbd element with '?'
		const kbds = container.querySelectorAll('kbd');
		const kbdTexts = Array.from(kbds).map((el) => el.textContent?.trim());
		expect(kbdTexts).toContain('?');
	});

	it('close button works', async () => {
		const { container } = render(ShortcutHintPanelTest, {
			props: { open: true, manager: createManagerWithShortcuts() }
		});

		const closeButton = screen.getByLabelText('Close shortcuts panel');
		expect(closeButton).toBeTruthy();

		await fireEvent.click(closeButton);

		// After clicking close, the dialog should be removed
		const dialog = container.querySelector('[role="dialog"]');
		expect(dialog).toBeNull();
	});

	it('shows footer hint text', () => {
		const { container } = render(ShortcutHintPanelTest, {
			props: { open: true, manager: createManagerWithShortcuts() }
		});

		// Footer contains "Esc" kbd and explanatory text
		expect(container.textContent).toContain('or click outside to close');
		const escKbd = Array.from(container.querySelectorAll('kbd')).find(
			(el) => el.textContent?.trim() === 'Esc'
		);
		expect(escKbd).toBeTruthy();
	});

	it('empty categories are hidden', () => {
		// Manager with only Navigation shortcuts
		const manager = new ShortcutManager();
		manager.register('Mod+K', {
			label: 'Go to search',
			category: 'Navigation',
			handler: vi.fn()
		});

		const { container } = render(ShortcutHintPanelTest, {
			props: { open: true, manager }
		});

		expect(screen.getByText('Navigation')).toBeTruthy();
		expect(screen.getByText('Go to search')).toBeTruthy();

		// Actions and General should not be rendered
		expect(screen.queryByText('Actions')).toBeNull();
		expect(screen.queryByText('General')).toBeNull();
	});

	it('does not render any shortcuts when manager has none', () => {
		const manager = new ShortcutManager();
		const { container } = render(ShortcutHintPanelTest, {
			props: { open: true, manager }
		});

		// Dialog should still render
		expect(screen.getByRole('dialog')).toBeTruthy();
		expect(screen.getByText('Keyboard Shortcuts')).toBeTruthy();

		// No category headings should appear
		expect(screen.queryByText('Navigation')).toBeNull();
		expect(screen.queryByText('Actions')).toBeNull();
		expect(screen.queryByText('General')).toBeNull();
	});

	it('closes on Escape key', async () => {
		const { container } = render(ShortcutHintPanelTest, {
			props: { open: true, manager: createManagerWithShortcuts() }
		});

		const dialog = screen.getByRole('dialog');
		await fireEvent.keyDown(dialog, { key: 'Escape' });

		expect(container.querySelector('[role="dialog"]')).toBeNull();
	});

	it('closes on backdrop click', async () => {
		const { container } = render(ShortcutHintPanelTest, {
			props: { open: true, manager: createManagerWithShortcuts() }
		});

		const backdrop = container.querySelector('[data-backdrop="1"]') as HTMLElement;
		expect(backdrop).toBeTruthy();
		await fireEvent.click(backdrop);

		expect(container.querySelector('[role="dialog"]')).toBeNull();
	});

	it('renders multiple shortcuts in the same category', () => {
		const manager = new ShortcutManager();
		manager.register('Mod+K', {
			label: 'Command palette',
			category: 'Navigation',
			handler: vi.fn()
		});
		manager.register('Mod+P', {
			label: 'Quick open',
			category: 'Navigation',
			handler: vi.fn()
		});

		render(ShortcutHintPanelTest, {
			props: { open: true, manager }
		});

		expect(screen.getByText('Command palette')).toBeTruthy();
		expect(screen.getByText('Quick open')).toBeTruthy();
	});
});
