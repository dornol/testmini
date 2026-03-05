<script lang="ts">
	import { beforeNavigate } from '$app/navigation';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as m from '$lib/paraglide/messages.js';

	let { dirty = false }: { dirty: boolean } = $props();

	let pendingNavigation = $state<{ to: { url: URL } | null; cancel: () => void } | null>(null);
	let dialogOpen = $state(false);

	beforeNavigate((navigation) => {
		if (dirty && !pendingNavigation) {
			navigation.cancel();
			pendingNavigation = navigation;
			dialogOpen = true;
		}
	});

	$effect(() => {
		if (!dirty) return;
		const handler = (e: BeforeUnloadEvent) => {
			e.preventDefault();
		};
		window.addEventListener('beforeunload', handler);
		return () => window.removeEventListener('beforeunload', handler);
	});

	function leave() {
		const nav = pendingNavigation;
		dialogOpen = false;
		pendingNavigation = null;
		if (nav?.to?.url) {
			// Use a microtask to avoid re-triggering the guard
			const url = nav.to.url;
			queueMicrotask(() => {
				window.location.href = url.href;
			});
		}
	}

	function stay() {
		dialogOpen = false;
		pendingNavigation = null;
	}
</script>

<AlertDialog.Root bind:open={dialogOpen}>
	<AlertDialog.Portal>
		<AlertDialog.Overlay />
		<AlertDialog.Content>
			<AlertDialog.Header>
				<AlertDialog.Title>{m.unsaved_changes_title()}</AlertDialog.Title>
				<AlertDialog.Description>{m.unsaved_changes_desc()}</AlertDialog.Description>
			</AlertDialog.Header>
			<AlertDialog.Footer>
				<Button variant="outline" onclick={stay}>{m.unsaved_changes_stay()}</Button>
				<Button variant="destructive" onclick={leave}>{m.unsaved_changes_leave()}</Button>
			</AlertDialog.Footer>
		</AlertDialog.Content>
	</AlertDialog.Portal>
</AlertDialog.Root>
