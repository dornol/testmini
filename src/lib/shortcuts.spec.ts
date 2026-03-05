import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	ShortcutManager,
	formatShortcut,
	isMac,
	modSymbol,
} from './shortcuts';

// ─── formatShortcut ───────────────────────────────────────────────────────────

describe('formatShortcut', () => {
	it('formats Mod as ⌘ on Mac', () => {
		vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
		expect(formatShortcut('Mod+S')).toBe('⌘ S');
	});

	it('formats Mod as Ctrl on non-Mac', () => {
		vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Win32');
		expect(formatShortcut('Mod+S')).toBe('Ctrl S');
	});

	it('formats Shift as ⇧', () => {
		vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Win32');
		expect(formatShortcut('Ctrl+Shift+K')).toBe('Ctrl ⇧ K');
	});

	it('formats Alt as ⌥ on Mac', () => {
		vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
		expect(formatShortcut('Alt+F')).toBe('⌥ F');
	});

	it('formats Alt as Alt on non-Mac', () => {
		vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Win32');
		expect(formatShortcut('Alt+F')).toBe('Alt F');
	});

	it('uppercases bare key tokens', () => {
		vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Win32');
		expect(formatShortcut('Mod+/')).toBe('Ctrl /');
	});
});

// ─── isMac / modSymbol ───────────────────────────────────────────────────────

describe('isMac', () => {
	it('returns true for MacIntel platform', () => {
		vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
		expect(isMac()).toBe(true);
	});

	it('returns false for Win32 platform', () => {
		vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Win32');
		expect(isMac()).toBe(false);
	});

	it('returns true for iPhone platform', () => {
		vi.spyOn(navigator, 'platform', 'get').mockReturnValue('iPhone');
		expect(isMac()).toBe(true);
	});
});

describe('modSymbol', () => {
	it('returns ⌘ on Mac', () => {
		vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
		expect(modSymbol()).toBe('⌘');
	});

	it('returns Ctrl on non-Mac', () => {
		vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Win32');
		expect(modSymbol()).toBe('Ctrl');
	});
});

// ─── ShortcutManager — register / unregister ────────────────────────────────

describe('ShortcutManager', () => {
	let manager: ShortcutManager;

	beforeEach(() => {
		manager = new ShortcutManager();
	});

	it('registers a shortcut and returns it from getAll()', () => {
		const handler = vi.fn();
		manager.register('Mod+S', { label: 'Save', category: 'Actions', handler });

		const all = manager.getAll();
		expect(all).toHaveLength(1);
		expect(all[0].combo).toBe('Mod+S');
		expect(all[0].definition.label).toBe('Save');
	});

	it('unregisters a shortcut via the returned cleanup function', () => {
		const handler = vi.fn();
		const unregister = manager.register('Mod+S', { label: 'Save', category: 'Actions', handler });

		expect(manager.getAll()).toHaveLength(1);
		unregister();
		expect(manager.getAll()).toHaveLength(0);
	});

	it('supports registering multiple shortcuts', () => {
		manager.register('Mod+S', { label: 'Save', category: 'Actions', handler: vi.fn() });
		manager.register('Mod+K', { label: 'Command Palette', category: 'Navigation', handler: vi.fn() });
		manager.register('?', { label: 'Help', category: 'General', handler: vi.fn() });

		expect(manager.getAll()).toHaveLength(3);
	});

	it('only unregisters the specific entry when the same combo is registered twice', () => {
		const handler1 = vi.fn();
		const handler2 = vi.fn();
		const unregister1 = manager.register('Mod+S', { label: 'Save 1', category: 'Actions', handler: handler1 });
		manager.register('Mod+S', { label: 'Save 2', category: 'Actions', handler: handler2 });

		unregister1();

		const all = manager.getAll();
		expect(all).toHaveLength(1);
		expect(all[0].definition.label).toBe('Save 2');
	});

	// ─── parseCombo (tested indirectly via handleKeydown) ──────────────────

	/**
	 * Build a minimal KeyboardEvent-like object. Using plain objects avoids
	 * a dependency on jsdom/happy-dom in the node test environment while still
	 * exercising the real handleKeydown / matchesEvent / parseCombo logic.
	 */
	function makeEvent(
		key: string,
		modifiers: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean; altKey?: boolean } = {},
		target: Partial<{ tagName: string; isContentEditable: boolean }> | null = null,
	): KeyboardEvent {
		return {
			key,
			ctrlKey: modifiers.ctrlKey ?? false,
			metaKey: modifiers.metaKey ?? false,
			shiftKey: modifiers.shiftKey ?? false,
			altKey: modifiers.altKey ?? false,
			target,
			preventDefault: vi.fn(),
		} as unknown as KeyboardEvent;
	}

	it('parses Mod+S and fires handler on matching keydown (non-Mac)', () => {
		vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Win32');
		const handler = vi.fn();
		manager.register('Mod+S', { label: 'Save', category: 'Actions', handler });

		manager.handleKeydown(makeEvent('s', { ctrlKey: true }));

		expect(handler).toHaveBeenCalledOnce();
	});

	it('parses Mod+S and fires handler on matching keydown (Mac)', () => {
		vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
		const handler = vi.fn();
		manager.register('Mod+S', { label: 'Save', category: 'Actions', handler });

		manager.handleKeydown(makeEvent('s', { metaKey: true }));

		expect(handler).toHaveBeenCalledOnce();
	});

	it('parses Ctrl+Shift+K and fires handler on matching keydown (Mac)', () => {
		// On Mac, Mod maps to metaKey, so a standalone Ctrl combo can fire
		// (ctrlKey=true, metaKey=false means Mod is not pressed).
		vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
		const handler = vi.fn();
		manager.register('Ctrl+Shift+K', { label: 'Toggle', category: 'Actions', handler });

		manager.handleKeydown(makeEvent('k', { ctrlKey: true, shiftKey: true }));

		expect(handler).toHaveBeenCalledOnce();
	});

	it('does not fire when modifier does not match', () => {
		vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Win32');
		const handler = vi.fn();
		manager.register('Mod+S', { label: 'Save', category: 'Actions', handler });

		// Fired without Ctrl/Meta
		manager.handleKeydown(makeEvent('s'));

		expect(handler).not.toHaveBeenCalled();
	});

	// ─── isEditableTarget (tested indirectly via handleKeydown) ────────────

	describe('isEditableTarget — suppresses bare shortcuts in editable elements', () => {
		it('does not fire a bare shortcut when target is an <input>', () => {
			const handler = vi.fn();
			manager.register('?', { label: 'Help', category: 'General', handler });

			manager.handleKeydown(
				makeEvent('?', {}, { tagName: 'INPUT', isContentEditable: false }),
			);

			expect(handler).not.toHaveBeenCalled();
		});

		it('does not fire a bare shortcut when target is a <textarea>', () => {
			const handler = vi.fn();
			manager.register('?', { label: 'Help', category: 'General', handler });

			manager.handleKeydown(
				makeEvent('?', {}, { tagName: 'TEXTAREA', isContentEditable: false }),
			);

			expect(handler).not.toHaveBeenCalled();
		});

		it('does not fire a bare shortcut when target is contenteditable', () => {
			const handler = vi.fn();
			manager.register('?', { label: 'Help', category: 'General', handler });

			manager.handleKeydown(
				makeEvent('?', {}, { tagName: 'DIV', isContentEditable: true }),
			);

			expect(handler).not.toHaveBeenCalled();
		});

		it('fires modifier shortcuts even when target is an <input>', () => {
			vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Win32');
			const handler = vi.fn();
			manager.register('Mod+S', { label: 'Save', category: 'Actions', handler });

			manager.handleKeydown(
				makeEvent('s', { ctrlKey: true }, { tagName: 'INPUT', isContentEditable: false }),
			);

			expect(handler).toHaveBeenCalledOnce();
		});
	});
});
