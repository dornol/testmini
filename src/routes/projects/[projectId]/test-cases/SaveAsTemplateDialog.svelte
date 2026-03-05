<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { toast } from 'svelte-sonner';
	import * as m from '$lib/paraglide/messages.js';

	interface Props {
		open: boolean;
		projectId: number;
		defaultName?: string;
		precondition?: string;
		steps?: { action: string; expected: string }[];
		priority?: string;
		onSaved?: (templateId: number) => void;
	}

	let {
		open = $bindable(),
		projectId,
		defaultName = '',
		precondition = '',
		steps = [],
		priority = 'MEDIUM',
		onSaved
	}: Props = $props();

	let templateName = $state('');
	let saving = $state(false);

	$effect(() => {
		if (open) {
			templateName = defaultName;
		}
	});

	async function save() {
		if (!templateName.trim()) return;
		saving = true;
		try {
			const res = await fetch(`/api/projects/${projectId}/templates`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: templateName.trim(),
					precondition,
					steps,
					priority
				})
			});
			if (res.ok) {
				const data = await res.json();
				toast.success(m.template_saved());
				open = false;
				onSaved?.(data.id);
			} else {
				const err = await res.json();
				toast.error(err.error || m.template_save_failed());
			}
		} catch {
			toast.error(m.template_save_failed());
		} finally {
			saving = false;
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Portal>
		<Dialog.Overlay />
		<Dialog.Content class="max-w-md">
			<Dialog.Header>
				<Dialog.Title>{m.template_save_as()}</Dialog.Title>
			</Dialog.Header>
			<div class="space-y-4 py-2">
				<div class="space-y-2">
					<Label for="template-name">{m.template_name_label()}</Label>
					<Input
						id="template-name"
						bind:value={templateName}
						placeholder={m.template_name_placeholder()}
						onkeydown={(e) => { if (e.key === 'Enter') save(); }}
					/>
				</div>
			</div>
			<Dialog.Footer>
				<Button variant="outline" onclick={() => { open = false; }}>{m.common_cancel()}</Button>
				<Button onclick={save} disabled={saving || !templateName.trim()}>
					{saving ? m.template_saving() : m.common_save_changes()}
				</Button>
			</Dialog.Footer>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
