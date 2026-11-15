<script lang="ts">
	import { flip } from 'svelte/animate';
	import { toast } from 'svelte-sonner';
	import { apiPut } from '$lib/api-client';
	import * as m from '$lib/paraglide/messages.js';
	import { DEFAULT_LAYOUT } from '$lib/dashboard-widgets';
	import type { WidgetConfig } from '$lib/server/db/schema';

	let { projectId, layout = $bindable() }: { projectId: number; layout: WidgetConfig[] } = $props();

	let open = $state(false);
	let draggedId = $state<string | null>(null);
	let dragOverId = $state<string | null>(null);
	let saveTimer: ReturnType<typeof setTimeout> | null = null;

	function scheduleSave() {
		if (saveTimer) clearTimeout(saveTimer);
		saveTimer = setTimeout(saveLayout, 600);
	}

	async function saveLayout() {
		try {
			await apiPut(`/api/projects/${projectId}/dashboard-layout`, {
				layout: $state.snapshot(layout)
			});
			toast.success(m.dashboard_layout_saved());
		} catch {
			// Error feedback is handled centrally by apiPut.
		}
	}

	function toggleWidget(id: string) {
		if (!layout.some((item) => item.id === id)) return;
		layout = layout.map((item) => (item.id === id ? { ...item, visible: !item.visible } : item));
		scheduleSave();
	}

	function setSize(id: string, size: WidgetConfig['size']) {
		if (!layout.some((item) => item.id === id)) return;
		layout = layout.map((item) => (item.id === id ? { ...item, size } : item));
		scheduleSave();
	}

	function resetLayout() {
		layout = DEFAULT_LAYOUT.map((widget) => ({ ...widget }));
		scheduleSave();
	}

	function onDragOver(id: string) {
		if (!draggedId || draggedId === id) return;
		dragOverId = id;
		const sorted = layout.slice().sort((a, b) => a.order - b.order);
		const fromIndex = sorted.findIndex((widget) => widget.id === draggedId);
		const toIndex = sorted.findIndex((widget) => widget.id === id);
		if (fromIndex === -1 || toIndex === -1) return;
		const [moved] = sorted.splice(fromIndex, 1);
		sorted.splice(toIndex, 0, moved);
		layout = sorted.map((widget, order) => ({ ...widget, order }));
	}

	function onDragEnd() {
		draggedId = null;
		dragOverId = null;
		scheduleSave();
	}

	function widgetLabel(id: string) {
		return (
			{
				stats_summary: m.dashboard_widget_stats(),
				pass_rate_trend: m.dashboard_widget_trend(),
				status_distribution: m.dashboard_widget_status(),
				recent_runs: m.dashboard_widget_recent(),
				priority_breakdown: m.dashboard_widget_priority(),
				top_failing: m.dashboard_widget_failing()
			}[id] ?? id
		);
	}

	function widgetDescription(id: string) {
		return (
			{
				stats_summary: m.dashboard_widget_stats_desc(),
				pass_rate_trend: m.dashboard_widget_trend_desc(),
				status_distribution: m.dashboard_widget_status_desc(),
				recent_runs: m.dashboard_widget_recent_desc(),
				priority_breakdown: m.dashboard_widget_priority_desc(),
				top_failing: m.dashboard_widget_failing_desc()
			}[id] ?? ''
		);
	}
</script>

<div class="mb-4 flex items-center justify-end">
	<button
		type="button"
		onclick={() => (open = !open)}
		class="text-muted-foreground hover:text-foreground hover:bg-accent flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors"
		aria-expanded={open}
		aria-controls="dashboard-customizer"
		aria-label={m.dashboard_customize_layout()}
	>
		<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
			<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
			<circle cx="12" cy="12" r="3" />
		</svg>
		{m.dashboard_customize()}
	</button>
</div>

{#if open}
	<div id="dashboard-customizer" class="bg-card border-border mb-6 rounded-lg border p-4 shadow-sm" role="region" aria-label={m.dashboard_widgets()}>
		<div class="mb-3 flex items-center justify-between">
			<h2 class="text-sm font-semibold">{m.dashboard_widgets()}</h2>
			<div class="flex items-center gap-2">
				<button type="button" onclick={resetLayout} class="text-muted-foreground hover:text-foreground rounded px-2 py-1 text-xs transition-colors hover:underline">
					{m.dashboard_reset_default()}
				</button>
				<button type="button" onclick={() => (open = false)} class="text-muted-foreground hover:text-foreground rounded p-1 transition-colors" aria-label={m.dashboard_close_panel()}>
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
				</button>
			</div>
		</div>
		<p class="text-muted-foreground mb-3 text-xs">{m.dashboard_customize_hint()}</p>
		<ul class="space-y-1" aria-label={m.dashboard_widget_list()}>
			{#each layout.slice().sort((a, b) => a.order - b.order) as widget (widget.id)}
				<li
					animate:flip={{ duration: 200 }}
					class="bg-background border-border flex items-center gap-3 rounded-md border px-3 py-2 text-sm transition-colors {draggedId === widget.id ? 'opacity-50' : ''} {dragOverId === widget.id ? 'border-primary' : ''}"
					draggable="true"
					ondragstart={() => (draggedId = widget.id)}
					ondragover={(event) => { event.preventDefault(); onDragOver(widget.id); }}
					ondragend={onDragEnd}
				>
					<span class="text-muted-foreground cursor-grab active:cursor-grabbing" aria-hidden="true">⠿</span>
					<button type="button" role="switch" aria-checked={widget.visible} aria-label={m.dashboard_toggle_widget({ name: widgetLabel(widget.id) })} onclick={() => toggleWidget(widget.id)} class="flex h-5 w-9 shrink-0 items-center rounded-full border-2 transition-colors {widget.visible ? 'bg-primary border-primary' : 'bg-muted border-muted'}">
						<span class="bg-background block h-3.5 w-3.5 rounded-full shadow transition-transform {widget.visible ? 'translate-x-[18px]' : 'translate-x-0.5'}"></span>
					</button>
					<div class="min-w-0 flex-1">
						<span class="font-medium {!widget.visible ? 'text-muted-foreground line-through' : ''}">{widgetLabel(widget.id)}</span>
						<p class="text-muted-foreground truncate text-xs">{widgetDescription(widget.id)}</p>
					</div>
					<div class="flex items-center gap-1 rounded-md border p-0.5" role="group" aria-label={m.dashboard_widget_size({ name: widgetLabel(widget.id) })}>
						{#each ['sm', 'md', 'lg'] as const as size (size)}
							<button type="button" onclick={() => setSize(widget.id, size)} class="rounded px-2 py-0.5 text-xs transition-colors {widget.size === size ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'}" aria-pressed={widget.size === size} aria-label={m.dashboard_size_option({ size })}>{size}</button>
						{/each}
					</div>
				</li>
			{/each}
		</ul>
	</div>
{/if}
