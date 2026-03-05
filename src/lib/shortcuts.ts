/**
 * Keyboard shortcut manager.
 *
 * Supports a `Mod` pseudo-modifier that maps to Cmd on macOS and Ctrl elsewhere,
 * matching the convention used by many editors (e.g. CodeMirror, ProseMirror).
 */

export type ModifierKey = 'Mod' | 'Ctrl' | 'Shift' | 'Alt';

export interface ShortcutDefinition {
	/** Human-readable label shown in the hint panel */
	label: string;
	/** Category used to group shortcuts in the hint panel */
	category: 'Navigation' | 'Actions' | 'General';
	/** Handler invoked when the shortcut fires */
	handler: () => void;
}

/**
 * A parsed shortcut descriptor, e.g. "Mod+S" → { mod: true, key: 's' }
 */
interface ParsedShortcut {
	mod: boolean;   // Cmd on Mac, Ctrl elsewhere
	ctrl: boolean;
	shift: boolean;
	alt: boolean;
	key: string;    // lowercase key name
}

/** Returns true when the runtime is macOS. Safe to call in the browser only. */
export function isMac(): boolean {
	if (typeof navigator === 'undefined') return false;
	return /Mac|iPhone|iPad|iPod/.test(navigator.platform);
}

/** Returns the display symbol for the Mod key on the current platform. */
export function modSymbol(): string {
	return isMac() ? '⌘' : 'Ctrl';
}

/** Returns a human-readable key combo string for display (e.g. "⌘ S", "Ctrl K"). */
export function formatShortcut(combo: string): string {
	const mac = isMac();
	return combo
		.split('+')
		.map((part) => {
			switch (part.trim()) {
				case 'Mod':   return mac ? '⌘' : 'Ctrl';
				case 'Shift': return '⇧';
				case 'Alt':   return mac ? '⌥' : 'Alt';
				case 'Ctrl':  return 'Ctrl';
				default:      return part.toUpperCase();
			}
		})
		.join(' ');
}

function parseCombo(combo: string): ParsedShortcut {
	const parts = combo.split('+').map((p) => p.trim());
	const key = parts[parts.length - 1].toLowerCase();
	return {
		mod:   parts.includes('Mod'),
		ctrl:  parts.includes('Ctrl'),
		shift: parts.includes('Shift'),
		alt:   parts.includes('Alt'),
		key,
	};
}

function matchesEvent(parsed: ParsedShortcut, event: KeyboardEvent): boolean {
	const mac = isMac();

	const modPressed = mac ? event.metaKey : event.ctrlKey;
	if (parsed.mod   && !modPressed)      return false;
	if (!parsed.mod  && modPressed)       return false;
	if (parsed.ctrl  && !event.ctrlKey)   return false;
	if (!parsed.ctrl && !parsed.mod && event.ctrlKey) return false;
	if (parsed.shift && !event.shiftKey)  return false;
	if (!parsed.shift && event.shiftKey)  return false;
	if (parsed.alt   && !event.altKey)    return false;
	if (!parsed.alt  && event.altKey)     return false;

	return event.key.toLowerCase() === parsed.key;
}

/** Returns true when the event target is an editable element. */
function isEditableTarget(event: KeyboardEvent): boolean {
	const target = event.target as HTMLElement | null;
	if (!target) return false;
	const tag = target.tagName.toLowerCase();
	if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
	if (target.isContentEditable) return true;
	return false;
}

export interface RegisteredShortcut {
	/** The raw combo string, e.g. "Mod+S" */
	combo: string;
	parsed: ParsedShortcut;
	definition: ShortcutDefinition;
}

export class ShortcutManager {
	private shortcuts: RegisteredShortcut[] = [];

	register(combo: string, definition: ShortcutDefinition): () => void {
		const entry: RegisteredShortcut = {
			combo,
			parsed: parseCombo(combo),
			definition,
		};
		this.shortcuts.push(entry);
		return () => {
			this.shortcuts = this.shortcuts.filter((s) => s !== entry);
		};
	}

	/** Returns all shortcuts grouped by category, in insertion order. */
	getAll(): RegisteredShortcut[] {
		return [...this.shortcuts];
	}

	/** Processes a KeyboardEvent and fires the matching handler (if any). */
	handleKeydown(event: KeyboardEvent): void {
		// Only block input-field shortcuts that have no modifiers.
		// Modifier combos (Mod+S etc.) are allowed even inside inputs.
		const hasModifier = event.ctrlKey || event.metaKey || event.altKey;
		if (!hasModifier && isEditableTarget(event)) return;

		for (const shortcut of this.shortcuts) {
			if (matchesEvent(shortcut.parsed, event)) {
				event.preventDefault();
				shortcut.definition.handler();
				return;
			}
		}
	}
}

/** Singleton manager used by KeyboardShortcuts.svelte and the hint panel. */
export const shortcutManager = new ShortcutManager();

// ─── Built-in shortcut combo strings (exported for use in the hint panel) ───
export const SHORTCUT_COMBOS = {
	SAVE:          'Mod+S',
	COMMAND_PALETTE: 'Mod+K',
	HINT_PANEL:    '?',
	HINT_PANEL_ALT: 'Mod+/',
	ESCAPE:        'Escape',
} as const;

// ─── Svelte context key ──────────────────────────────────────────────────────
export const SHORTCUTS_CONTEXT_KEY = Symbol('keyboard-shortcuts');

export interface ShortcutsContext {
	/** Register a page-specific shortcut. Returns an unregister function. */
	register(combo: string, definition: ShortcutDefinition): () => void;
	/** Access the shared manager directly if needed. */
	manager: ShortcutManager;
}
