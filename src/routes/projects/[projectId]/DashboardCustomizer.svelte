<script lang="ts">
	import { onDestroy, tick } from 'svelte';
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	import ArrowDown from '@lucide/svelte/icons/arrow-down';
	import GripVertical from '@lucide/svelte/icons/grip-vertical';
	import Settings from '@lucide/svelte/icons/settings';
	import { Button } from '$lib/components/ui/button';
	import { apiFetch } from '$lib/api-client';
	import * as m from '$lib/paraglide/messages.js';
	import { DEFAULT_LAYOUT } from '$lib/dashboard-widgets';
	import type { WidgetConfig } from '$lib/server/db/schema';

	let { projectId, layout = $bindable() }: { projectId: number; layout: WidgetConfig[] } = $props();

	let open = $state(false);
	let draggedId = $state<string | null>(null);
	let dragOverId = $state<string | null>(null);
	let phase = $state<'idle' | 'pending' | 'saved' | 'error'>('idle');
	let moveAnnouncement = $state('');
	let trigger = $state<HTMLElement | null>(null);
	let timer: ReturnType<typeof setTimeout> | undefined;
	let saving = false;
	let queued: { projectId: number; layout: WidgetConfig[] } | undefined;

	function updateLayout(next: WidgetConfig[]) {
		layout = next;
		queued = { projectId, layout: $state.snapshot(layout) };
		phase = 'pending';
		clearTimeout(timer);
		timer = setTimeout(() => {
			timer = undefined;
			void save();
		}, 600);
	}

	async function save() {
		if (saving || !queued) return;
		const request = queued;
		queued = undefined;
		saving = true;
		phase = 'pending';
		try {
			await apiFetch(`/api/projects/${request.projectId}/dashboard-layout`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ layout: request.layout }),
				silent: true
			});
			if (!queued) phase = 'saved';
		} catch {
			if (!queued) {
				queued = request;
				phase = 'error';
			}
		} finally {
			saving = false;
			if (queued && !timer && phase !== 'error') void save();
		}
	}

	onDestroy(() => {
		clearTimeout(timer);
		timer = undefined;
		if (phase === 'pending') void save();
	});

	function move(id: string, target: number, control?: HTMLElement) {
		const from = layout.findIndex((widget) => widget.id === id);
		if (from < 0 || target < 0 || target >= layout.length || from === target) return;
		const next = [...layout];
		const [moved] = next.splice(from, 1);
		next.splice(target, 0, moved);
		updateLayout(next.map((widget, order) => ({ ...widget, order })));
		moveAnnouncement = m.dashboard_widget_moved({ name: widgetLabel(id), position: target + 1 });
		if (control) void tick().then(() => control.focus());
	}

	function drop(event: DragEvent, target: number) {
		event.preventDefault();
		if (draggedId) move(draggedId, target);
		clearDrag();
	}

	function clearDrag() {
		draggedId = null;
		dragOverId = null;
	}

	async function close() {
		open = false;
		await tick();
		trigger?.focus();
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

<div class="mb-4 flex flex-wrap items-center justify-end gap-2">
	{#if phase === 'error'}
		<p role="alert" class="text-sm text-destructive">{m.ui_save_failed()}</p>
		<Button
			variant="outline"
			onclick={async () => {
				await save();
				if (phase === 'saved') trigger?.focus();
			}}>{m.ui_try_again()}</Button
		>
	{:else}
		<span role="status" class="text-sm text-muted-foreground">
			{phase === 'pending'
				? m.common_saving()
				: phase === 'saved'
					? m.dashboard_layout_saved()
					: ''}
		</span>
	{/if}
	<Button
		variant="outline"
		bind:ref={trigger}
		onclick={() => (open ? close() : (open = true))}
		aria-expanded={open}
		aria-controls="dashboard-customizer"
		aria-label={m.dashboard_customize_layout()}
	>
		<Settings aria-hidden="true" />
		{m.dashboard_customize()}
	</Button>
</div>

<section
	id="dashboard-customizer"
	aria-labelledby="dashboard-widget-heading"
	hidden={!open}
	class="mb-4 space-y-3 rounded-lg border bg-card p-4"
>
	<div class="flex flex-wrap items-center justify-between gap-2">
		<h3 id="dashboard-widget-heading" class="text-lg font-medium">{m.dashboard_widgets()}</h3>
		<div class="flex flex-wrap gap-2">
			<Button
				variant="outline"
				size="sm"
				onclick={() => updateLayout(DEFAULT_LAYOUT.map((widget) => ({ ...widget })))}
			>
				{m.dashboard_reset_default()}
			</Button>
			<Button variant="ghost" size="sm" onclick={close} aria-label={m.dashboard_close_panel()}>
				{m.common_close()}
			</Button>
		</div>
	</div>
	<p class="text-sm text-muted-foreground">{m.dashboard_customize_hint()}</p>
	<p role="status" class="sr-only">{moveAnnouncement}</p>
	<ol class="space-y-2" aria-label={m.dashboard_widget_list()}>
		{#each layout as widget, index (widget.id)}
			{@const name = widgetLabel(widget.id)}
			<li
				class="space-y-2 rounded-md border bg-background p-3 {dragOverId === widget.id
					? 'border-primary'
					: ''}"
				draggable="true"
				ondragstart={(event) => {
					draggedId = widget.id;
					event.dataTransfer?.setData('text/plain', widget.id);
				}}
				ondragover={(event) => {
					if (!draggedId) return;
					event.preventDefault();
					dragOverId = widget.id;
				}}
				ondrop={(event) => drop(event, index)}
				ondragend={clearDrag}
			>
				<div class="flex flex-wrap items-start justify-between gap-2">
					<div class="flex min-w-0 gap-2">
						<GripVertical
							class="mt-1 size-4 shrink-0 cursor-grab text-muted-foreground"
							aria-hidden="true"
						/>
						<div class="min-w-0">
							<p class="text-sm font-medium">{name}</p>
							<p class="text-xs text-muted-foreground">{widgetDescription(widget.id)}</p>
						</div>
					</div>
					<Button
						variant="outline"
						size="sm"
						role="switch"
						aria-checked={widget.visible}
						aria-label={m.dashboard_toggle_widget({ name })}
						onclick={() =>
							updateLayout(
								layout.map((item) =>
									item.id === widget.id ? { ...item, visible: !item.visible } : item
								)
							)}
					>
						<span
							aria-hidden="true"
							class="relative inline-flex h-4 w-7 items-center rounded-full border {widget.visible
								? 'border-primary bg-primary'
								: 'border-muted-foreground bg-muted'}"
						>
							<span
								class="absolute size-2.5 rounded-full {widget.visible
									? 'end-0.5 bg-primary-foreground'
									: 'start-0.5 bg-muted-foreground'}"
							></span>
						</span>
					</Button>
				</div>
				<div class="flex flex-wrap items-center justify-between gap-2">
					<div
						class="flex flex-wrap gap-1"
						role="group"
						aria-label={m.dashboard_widget_size({ name })}
					>
						{#each ['sm', 'md', 'lg'] as const as size, i (size)}
							{@const label = [
								m.dashboard_width_small(),
								m.dashboard_width_medium(),
								m.dashboard_width_large()
							][i]}
							<Button
								size="sm"
								variant={widget.size === size ? 'secondary' : 'outline'}
								aria-pressed={widget.size === size}
								onclick={() =>
									updateLayout(
										layout.map((item) => (item.id === widget.id ? { ...item, size } : item))
									)}>{label}</Button
							>
						{/each}
					</div>
					<div class="flex gap-1">
						<Button
							variant="outline"
							size="icon-sm"
							aria-disabled={index === 0}
							aria-label={m.dashboard_widget_move_up({ name })}
							onclick={(event) => move(widget.id, index - 1, event.currentTarget)}
						>
							<ArrowUp aria-hidden="true" />
						</Button>
						<Button
							variant="outline"
							size="icon-sm"
							aria-disabled={index === layout.length - 1}
							aria-label={m.dashboard_widget_move_down({ name })}
							onclick={(event) => move(widget.id, index + 1, event.currentTarget)}
						>
							<ArrowDown aria-hidden="true" />
						</Button>
					</div>
				</div>
			</li>
		{/each}
	</ol>
</section>
