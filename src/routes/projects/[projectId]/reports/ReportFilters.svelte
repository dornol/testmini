<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';

	let {
		dateRange,
		isAdmin,
		onExportPdf,
		onOpenShareDialog,
		onOpenScheduleDialog
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
		return new Date(iso).toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	const activeDateLabel = $derived(
		isAllTime
			? m.filter_all_time()
			: dateRange.from && dateRange.to
				? `${formatDisplayDate(dateRange.from)} – ${formatDisplayDate(dateRange.to)}`
				: m.filter_last_30_days()
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
				{#each [['7', m.filter_last_7_days()], ['30', m.filter_last_30_days()], ['90', m.filter_last_90_days()], ['all', m.filter_all_time()]] as [preset, label] (preset)}
					<Button
						size="sm"
						variant={activePreset === preset ? 'default' : 'outline'}
						onclick={() => applyPreset(preset === 'all' ? 'all' : Number(preset))}
						class="h-8 px-2.5 text-xs"
					>
						{label}
					</Button>
				{/each}
			</div>

			<!-- Custom date inputs -->
			<div class="grid grid-cols-2 items-end gap-2 sm:flex">
				<div class="flex min-w-0 flex-col gap-1">
					<label for="date-from" class="text-muted-foreground text-xs">{m.filter_from()}</label>
					<Input
						id="date-from"
						type="date"
						value={pendingFrom || fromInput}
						oninput={(e) => {
							pendingFrom = (e.currentTarget as HTMLInputElement).value;
						}}
						max={pendingTo || toInput || undefined}
						class="report-date-input h-8 w-full px-2 text-xs sm:w-36"
					/>
				</div>
				<div class="flex min-w-0 flex-col gap-1">
					<label for="date-to" class="text-muted-foreground text-xs">{m.filter_to()}</label>
					<Input
						id="date-to"
						type="date"
						value={pendingTo || toInput}
						oninput={(e) => {
							pendingTo = (e.currentTarget as HTMLInputElement).value;
						}}
						min={pendingFrom || fromInput || undefined}
						class="report-date-input h-8 w-full px-2 text-xs sm:w-36"
					/>
				</div>
				<Button
					size="sm"
					class="col-span-2 h-8 w-full text-xs sm:w-auto"
					onclick={applyDateRange}
					disabled={!pendingFrom && !pendingTo && !fromInput && !toInput}
				>
					{m.filter_apply()}
				</Button>
			</div>
		</div>

		<!-- Active range label + action buttons -->
		<div class="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
			<p class="text-muted-foreground min-w-0 text-xs">
				{m.filter_showing_data_for()}
				<span class="text-foreground font-medium">{activeDateLabel}</span>
			</p>
			<div class="grid grid-cols-1 gap-2 min-[420px]:grid-cols-3 sm:flex sm:flex-wrap">
				<Button
					size="sm"
					variant="outline"
					class="h-8 w-full text-xs sm:h-7 sm:w-auto"
					onclick={onExportPdf}
				>
					{m.report_export_pdf()}
				</Button>
				<Button
					size="sm"
					variant="outline"
					class="h-8 w-full text-xs sm:h-7 sm:w-auto"
					onclick={onOpenShareDialog}
				>
					{m.report_share()}
				</Button>
				{#if isAdmin}
					<Button
						size="sm"
						variant="outline"
						class="h-8 w-full text-xs sm:h-7 sm:w-auto"
						onclick={onOpenScheduleDialog}
					>
						{m.report_schedule()}
					</Button>
				{/if}
			</div>
		</div>
	</Card.Content>
</Card.Root>

<style>
	:global(.report-date-input) {
		font-variant-numeric: tabular-nums;
		line-height: 1;
	}

	:global(.report-date-input)::-webkit-date-and-time-value {
		min-width: 0;
		text-align: left;
	}

	:global(.report-date-input)::-webkit-datetime-edit {
		display: flex;
		min-width: 0;
		flex: 1;
		align-items: center;
		padding: 0;
	}

	:global(.report-date-input)::-webkit-datetime-edit-fields-wrapper {
		display: flex;
		align-items: center;
		padding: 0;
	}

	:global(.report-date-input)::-webkit-calendar-picker-indicator {
		width: 1rem;
		height: 1rem;
		margin: 0 0 0 auto;
		padding: 0;
	}
</style>
