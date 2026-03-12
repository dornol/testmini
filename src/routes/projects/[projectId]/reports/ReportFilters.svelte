<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';

	let {
		dateRange,
		isAdmin,
		onExportPdf,
		onOpenShareDialog,
		onOpenScheduleDialog,
	}: {
		dateRange: { allTime: boolean; from: string | null; to: string | null };
		isAdmin: boolean;
		onExportPdf: () => void;
		onOpenShareDialog: () => void;
		onOpenScheduleDialog: () => void;
	} = $props();

	const isAllTime = $derived(dateRange.allTime);
	const fromInput = $derived(dateRange.from ?? '');
	const toInput = $derived(dateRange.to ?? '');

	let pendingFrom = $state('');
	let pendingTo = $state('');

	function buildUrl(from: string | null, to: string | null, preset?: string): string {
		const url = new URL($page.url);
		url.searchParams.delete('from');
		url.searchParams.delete('to');
		url.searchParams.delete('preset');
		if (preset === 'all') {
			url.searchParams.set('preset', 'all');
		} else {
			if (from) url.searchParams.set('from', from);
			if (to) url.searchParams.set('to', to);
		}
		return url.toString();
	}

	function applyDateRange() {
		goto(buildUrl(pendingFrom || null, pendingTo || null));
	}

	function applyPreset(days: number | 'all') {
		if (days === 'all') {
			goto(buildUrl(null, null, 'all'));
			return;
		}
		const to = new Date();
		const from = new Date();
		from.setDate(from.getDate() - days);
		goto(buildUrl(from.toISOString().slice(0, 10), to.toISOString().slice(0, 10)));
	}

	function formatDisplayDate(iso: string | null): string {
		if (!iso) return '';
		return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
	}

	const activeDateLabel = $derived(
		isAllTime
			? 'All time'
			: dateRange.from && dateRange.to
				? `${formatDisplayDate(dateRange.from)} – ${formatDisplayDate(dateRange.to)}`
				: 'Last 30 days'
	);

	function presetFromDate(days: number): string {
		const d = new Date();
		d.setDate(d.getDate() - days);
		return d.toISOString().slice(0, 10);
	}

	const activePreset = $derived(
		isAllTime
			? 'all'
			: fromInput === presetFromDate(7)
				? '7'
				: fromInput === presetFromDate(30)
					? '30'
					: fromInput === presetFromDate(90)
						? '90'
						: 'custom'
	);
</script>

<Card.Root>
	<Card.Content class="pt-4 pb-3">
		<div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
			<!-- Preset buttons -->
			<div class="flex flex-wrap gap-1.5">
				{#each ([['7', 'Last 7 days'], ['30', 'Last 30 days'], ['90', 'Last 90 days'], ['all', 'All time']] as const) as [preset, label] (preset)}
					<button
						type="button"
						onclick={() => applyPreset(preset === 'all' ? 'all' : Number(preset))}
						class="rounded-md border px-2.5 py-1 text-xs font-medium transition-colors
							{activePreset === preset
								? 'bg-primary text-primary-foreground border-primary'
								: 'bg-background hover:bg-accent border-input'}"
					>
						{label}
					</button>
				{/each}
			</div>

			<!-- Custom date inputs -->
			<div class="flex items-end gap-2">
				<div class="flex flex-col gap-1">
					<label for="date-from" class="text-muted-foreground text-xs">From</label>
					<input
						id="date-from"
						type="date"
						value={pendingFrom || fromInput}
						oninput={(e) => { pendingFrom = (e.currentTarget as HTMLInputElement).value; }}
						max={pendingTo || toInput || undefined}
						class="border-input bg-background rounded-md border px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
					/>
				</div>
				<div class="flex flex-col gap-1">
					<label for="date-to" class="text-muted-foreground text-xs">To</label>
					<input
						id="date-to"
						type="date"
						value={pendingTo || toInput}
						oninput={(e) => { pendingTo = (e.currentTarget as HTMLInputElement).value; }}
						min={pendingFrom || fromInput || undefined}
						class="border-input bg-background rounded-md border px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
					/>
				</div>
				<Button size="sm" class="h-[34px] text-xs" onclick={applyDateRange} disabled={!pendingFrom && !pendingTo && !fromInput && !toInput}>
					Apply
				</Button>
			</div>
		</div>

		<!-- Active range label + action buttons -->
		<div class="mt-2 flex items-center justify-between">
			<p class="text-muted-foreground text-xs">
				Showing data for: <span class="text-foreground font-medium">{activeDateLabel}</span>
			</p>
			<div class="flex gap-2">
				<Button size="sm" variant="outline" class="h-7 text-xs" onclick={onExportPdf}>
					{m.report_export_pdf()}
				</Button>
				<Button size="sm" variant="outline" class="h-7 text-xs" onclick={onOpenShareDialog}>
					{m.report_share()}
				</Button>
				{#if isAdmin}
					<Button size="sm" variant="outline" class="h-7 text-xs" onclick={onOpenScheduleDialog}>
						{m.report_schedule()}
					</Button>
				{/if}
			</div>
		</div>
	</Card.Content>
</Card.Root>
