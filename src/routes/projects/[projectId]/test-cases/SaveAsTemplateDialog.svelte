<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { toast } from 'svelte-sonner';
	import * as m from '$lib/paraglide/messages.js';
	import { apiPost } from '$lib/api-client';

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
			const data = await apiPost<{ id: number }>(`/api/projects/${projectId}/templates`, {
				name: templateName.trim(),
				precondition,
				steps,
				priority
			});
			toast.success(m.template_saved());
			open = false;
			onSaved?.(data.id);
		} catch {
			// error toast handled by apiPost
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
