<script lang="ts">
	import * as Select from '$lib/components/ui/select/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { toast } from 'svelte-sonner';
	import * as m from '$lib/paraglide/messages.js';
	import { apiFetch } from '$lib/api-client';

	interface Template {
		id: number;
		name: string;
		precondition: string | null;
		steps: { order: number; action: string; expected: string }[];
		priority: string;
	}

	interface Props {
		projectId: number;
		onApply: (template: Template) => void;
	}

	let { projectId, onApply }: Props = $props();

	let templates = $state<Template[]>([]);
	let selectedId = $state('');
	let loading = $state(false);
	let loaded = $state(false);

	async function loadTemplates() {
		if (loaded) return;
		loading = true;
		try {
			templates = await apiFetch<Template[]>(`/api/projects/${projectId}/templates`);
			loaded = true;
		} catch {
			// error toast handled by apiFetch
		} finally {
			loading = false;
		}
	}

	function applyTemplate() {
		const template = templates.find((t) => String(t.id) === selectedId);
		if (!template) return;
		onApply(template);
		toast.success(m.template_applied());
		selectedId = '';
	}
</script>

<div class="flex items-center gap-2">
	<Select.Root
		type="single"
		value={selectedId}
		onValueChange={(v: string) => { selectedId = v; }}
		onOpenChange={(open) => { if (open) loadTemplates(); }}
	>
		<Select.Trigger class="w-56">
			{selectedId
				? (templates.find((t) => String(t.id) === selectedId)?.name ?? m.template_select_placeholder())
				: m.template_create_from()}
		</Select.Trigger>
		<Select.Content>
			{#if loading}
				<div class="px-3 py-2 text-sm text-muted-foreground">{m.tc_failure_loading()}</div>
			{:else if templates.length === 0}
				<div class="px-3 py-2 text-sm text-muted-foreground">{m.template_none()}</div>
			{:else}
				{#each templates as template (template.id)}
					<Select.Item value={String(template.id)} label={template.name} />
				{/each}
			{/if}
		</Select.Content>
	</Select.Root>
	{#if selectedId}
		<Button size="sm" variant="secondary" onclick={applyTemplate}>
			{m.template_applied()}
		</Button>
	{/if}
</div>
