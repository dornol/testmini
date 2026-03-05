<script lang="ts">
	import { setContext, onMount } from 'svelte';
	import {
		shortcutManager,
		SHORTCUTS_CONTEXT_KEY,
		SHORTCUT_COMBOS,
		type ShortcutsContext,
	} from '$lib/shortcuts';
	import ShortcutHintPanel from './ShortcutHintPanel.svelte';

	// Hint panel visibility state
	let hintPanelOpen = $state(false);

	// Expose a context so child/page components can register page-specific shortcuts
	const context: ShortcutsContext = {
		register(combo, definition) {
			return shortcutManager.register(combo, definition);
		},
		manager: shortcutManager,
	};

	setContext(SHORTCUTS_CONTEXT_KEY, context);

	// ─── Register built-in global shortcuts once on mount ──────────────────
	onMount(() => {
		const unregister: (() => void)[] = [];

		// Mod+S — Save: submit the first form on the page
		unregister.push(
			shortcutManager.register(SHORTCUT_COMBOS.SAVE, {
				label: 'Save',
				category: 'Actions',
				handler() {
					const form =
						document.querySelector<HTMLFormElement>('form[data-shortcut-save]') ??
						document.querySelector<HTMLFormElement>('form');
					if (form) {
						const submitBtn = form.querySelector<HTMLButtonElement>(
							'button[type="submit"], input[type="submit"]'
						);
						if (submitBtn) {
							submitBtn.click();
						} else {
							form.requestSubmit();
						}
					}
				},
			})
		);

		// Mod+K — Focus search input / open command palette
		unregister.push(
			shortcutManager.register(SHORTCUT_COMBOS.COMMAND_PALETTE, {
				label: 'Search / Command palette',
				category: 'Navigation',
				handler() {
					const searchInput = document.querySelector<HTMLInputElement>(
						'[data-shortcut-search], input[type="search"], input[placeholder*="search" i], input[placeholder*="검색" i]'
					);
					if (searchInput) {
						searchInput.focus();
						searchInput.select();
					}
				},
			})
		);

		// ? — Toggle hint panel
		unregister.push(
			shortcutManager.register(SHORTCUT_COMBOS.HINT_PANEL, {
				label: 'Show keyboard shortcuts',
				category: 'General',
				handler() {
					hintPanelOpen = !hintPanelOpen;
				},
			})
		);

		// Mod+/ — Toggle hint panel (alternate)
		unregister.push(
			shortcutManager.register(SHORTCUT_COMBOS.HINT_PANEL_ALT, {
				label: 'Show keyboard shortcuts (alt)',
				category: 'General',
				handler() {
					hintPanelOpen = !hintPanelOpen;
				},
			})
		);

		// Escape — Close hint panel or open dialogs
		unregister.push(
			shortcutManager.register(SHORTCUT_COMBOS.ESCAPE, {
				label: 'Close dialog / panel',
				category: 'General',
				handler() {
					if (hintPanelOpen) {
						hintPanelOpen = false;
						return;
					}
					const openDialog = document.querySelector<HTMLElement>('[data-state="open"][role="dialog"]');
					if (openDialog) {
						openDialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
					}
				},
			})
		);

		return () => {
			unregister.forEach((fn) => fn());
		};
	});

	function handleKeydown(event: KeyboardEvent) {
		shortcutManager.handleKeydown(event);
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<ShortcutHintPanel bind:open={hintPanelOpen} />
