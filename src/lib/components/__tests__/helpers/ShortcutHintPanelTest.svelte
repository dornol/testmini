<script lang="ts">
	import { setContext } from 'svelte';
	import { SHORTCUTS_CONTEXT_KEY, type ShortcutsContext, type ShortcutDefinition, ShortcutManager } from '$lib/shortcuts';
	import ShortcutHintPanel from '../../ShortcutHintPanel.svelte';

	interface Props {
		open: boolean;
		manager?: ShortcutManager;
	}

	let { open, manager = new ShortcutManager() }: Props = $props();

	const ctx: ShortcutsContext = {
		register(combo: string, definition: ShortcutDefinition) {
			return manager.register(combo, definition);
		},
		manager
	};

	setContext(SHORTCUTS_CONTEXT_KEY, ctx);
</script>

<ShortcutHintPanel bind:open />
