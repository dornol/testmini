<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { getLocale } from '$lib/paraglide/runtime.js';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import FilterToolbar from '$lib/components/patterns/FilterToolbar.svelte';
	import CalendarIcon from '@lucide/svelte/icons/calendar';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { tick } from 'svelte';
	import { reportCalendarDate } from '$lib/report-calendar';

	let {
		dateRange,
		invalidRange,
		isAdmin,
		onExportPdf,
		onOpenShareDialog,
		onOpenScheduleDialog
	}: {
		dateRange: { allTime: boolean; from: string | null; to: string | null };
		invalidRange: boolean;
		isAdmin: boolean;
		onExportPdf: () => void;
		onOpenShareDialog: () => void;
		onOpenScheduleDialog: () => void;
	} = $props();

	let draft = $state<Partial<Record<'from' | 'to', string>>>({});
	let fieldError = $state<'missing' | 'reversed' | null>(null);
	let navigationFailed = $state(false);
	let pending = $state(false);
	let errorElement = $state<HTMLElement>();
	const from = $derived(draft.from ?? dateRange.from ?? '');
	const to = $derived(draft.to ?? dateRange.to ?? '');

	$effect(() => {
		// The URL owns the applied range, including back and forward navigation.
		const href = page.url.href;
		if (href) {
			draft = {};
			fieldError = null;
			navigationFailed = false;
		}
	});

	function afterDays(date: Date, days: number): string {
		const result = new Date(date);
		result.setDate(result.getDate() + days);
		return reportCalendarDate(result);
	}

	async function navigateRange(start: string, end: string, all = false) {
		if (pending) return;
		const url = new URL(page.url);
		for (const key of ['from', 'to', 'preset']) url.searchParams.delete(key);
		if (all) url.searchParams.set('preset', 'all');
		else {
			url.searchParams.set('from', start);
			url.searchParams.set('to', end);
		}
		fieldError = null;
		navigationFailed = false;
		pending = true;
		try {
			await goto(url, { keepFocus: true, noScroll: true });
			draft = {};
		} catch {
			navigationFailed = true;
		} finally {
			pending = false;
		}
	}

	async function applyDateRange(event: SubmitEvent) {
		event.preventDefault();
		if (!from || !to || from > to) {
			fieldError = !from || !to ? 'missing' : 'reversed';
			await tick();
			errorElement?.focus();
			return;
		}
		await navigateRange(from, to);
	}

	function applyPreset(preset: string) {
		const today = new Date();
		return preset === 'all'
			? navigateRange('', '', true)
			: navigateRange(afterDays(today, -Number(preset)), reportCalendarDate(today));
	}

	const fields = ['from', 'to'] as const;
	const currentDay = reportCalendarDate(new Date());
	const activePreset = $derived(
		dateRange.allTime
			? 'all'
			: dateRange.to === currentDay
				? ['7', '30', '90'].find((days) => dateRange.from === afterDays(new Date(), -Number(days)))
				: undefined
	);
	const formatDate = (iso: string) =>
		new Date(iso + 'T00:00:00Z').toLocaleDateString(getLocale(), {
			dateStyle: 'medium',
			timeZone: 'UTC'
		});
	const activeLabel = $derived(
		dateRange.from && dateRange.to
			? `${formatDate(dateRange.from)} – ${formatDate(dateRange.to)}`
			: m.filter_all_time()
	);
</script>

<FilterToolbar label={m.report_date_range()} class="flex-col items-stretch gap-4">
	<div class="flex flex-wrap gap-2" role="group" aria-label={m.report_date_range()}>
		{#each [['7', m.filter_last_7_days()], ['30', m.filter_last_30_days()], ['90', m.filter_last_90_days()], ['all', m.filter_all_time()]] as [preset, label] (preset)}
			<Button
				variant={activePreset === preset ? 'default' : 'outline'}
				aria-pressed={activePreset === preset}
				disabled={pending}
				onclick={() => applyPreset(preset)}>{label}</Button
			>
		{/each}
	</div>
	<form novalidate aria-busy={pending} class="space-y-2" onsubmit={applyDateRange}>
		{#if fieldError}
			<p
				id="report-range-error"
				role="alert"
				tabindex="-1"
				bind:this={errorElement}
				class="text-sm text-destructive"
			>
				{fieldError === 'missing' ? m.report_dates_required() : m.ui_end_date_after_start()}
			</p>
		{/if}
		<div class="grid min-w-0 grid-cols-2 items-end gap-2 sm:flex sm:flex-wrap">
			{#each fields as field (field)}
				{@const bad =
					fieldError === 'reversed' ||
					(fieldError === 'missing' && !(field === 'from' ? from : to))}
				<div class="flex min-w-0 flex-col gap-1">
					<label for={`date-${field}`} class="text-sm font-medium"
						>{field === 'from' ? m.filter_from() : m.filter_to()}</label
					>
					<div class="relative">
						<Input
							id={`date-${field}`}
							type="date"
							required
							disabled={pending}
							value={field === 'from' ? from : to}
							aria-invalid={!!bad}
							aria-describedby={bad ? 'report-range-error' : undefined}
							max={field === 'from' ? to || undefined : undefined}
							min={field === 'to' ? from || undefined : undefined}
							oninput={(event) => {
								draft[field] = event.currentTarget.value;
								fieldError = null;
							}}
							class="report-date-input w-full px-2 pr-7 sm:w-40"
						/>
						<CalendarIcon
							class="pointer-events-none absolute top-1/2 right-2 size-4 -translate-y-1/2"
							aria-hidden="true"
						/>
					</div>
				</div>
			{/each}
			<Button type="submit" disabled={pending} class="col-span-2"
				>{pending ? m.common_loading() : m.filter_apply()}</Button
			>
		</div>
	</form>
	{#if invalidRange}<p class="text-sm text-destructive" role="status">
			{m.report_invalid_saved_range()}
		</p>{/if}
	{#if navigationFailed}<p class="text-sm text-destructive" role="alert">
			{m.ui_load_failed()}
		</p>{/if}
	<div class="flex min-w-0 flex-wrap items-center justify-between gap-3 border-t pt-3">
		<p class="text-sm text-muted-foreground" role="status">
			{m.filter_showing_data_for()} <span class="font-medium text-foreground">{activeLabel}</span>
		</p>
		<div class="flex min-w-0 flex-wrap gap-2">
			<Button variant="outline" onclick={onExportPdf} disabled={pending}
				>{m.report_export_pdf()}</Button
			>
			<Button variant="outline" onclick={onOpenShareDialog} disabled={pending}
				>{m.report_share()}</Button
			>
			{#if isAdmin}<Button variant="outline" onclick={onOpenScheduleDialog}
					>{m.report_schedule()}</Button
				>{/if}
		</div>
	</div>
</FilterToolbar>

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
		position: absolute;
		inset: 0;
		width: auto;
		height: auto;
		margin: 0;
		padding: 0;
		cursor: pointer;
		opacity: 0;
	}
</style>
