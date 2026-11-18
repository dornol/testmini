<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { toast } from 'svelte-sonner';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { apiFetch } from '$lib/api-client';
	import * as m from '$lib/paraglide/messages.js';
	import { getLocale } from '$lib/paraglide/runtime.js';
	import {
		MAX_REPORT_SCHEDULE_NAME_LENGTH,
		MAX_REPORT_SCHEDULE_RECIPIENTS,
		isScheduleEmail
	} from '$lib/report-schedule-limits';

	type Schedule = {
		id: number;
		name: string;
		cronExpression: string;
		recipientEmails: string[];
		reportRange: string;
		enabled: boolean;
		lastSentAt: string | null;
	};
	let {
		open = $bindable(false),
		endpoint,
		timeZone
	}: { open: boolean; endpoint: string; timeZone: string } = $props();
	const weekly = '0 9 * * 1';
	const monthly = '0 9 1 * *';
	const defaultRange = 'last_7_days';
	const ranges = new Map([
		[defaultRange, m.filter_last_7_days],
		['last_30_days', m.filter_last_30_days],
		['all', m.filter_all_time]
	]);
	const selectClass =
		'h-10 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';
	let schedules = $state<Schedule[]>([]);
	let name = $state('');
	let cronExpression = $state(weekly);
	let recipients = $state('');
	let reportRange = $state(defaultRange);
	let loading = $state(false);
	let loadFailed = $state(false);
	let busy = $state(false);
	let message = $state('');
	let feedback = $state<HTMLElement>();
	let nameInput = $state<HTMLInputElement | null>(null);

	$effect(() => {
		if (open) untrack(loadSchedules);
		else message = '';
	});

	async function loadSchedules() {
		if (loading || busy) return;
		loadFailed = false;
		loading = true;
		try {
			schedules = await apiFetch<Schedule[]>(endpoint, { silent: true });
		} catch {
			loadFailed = true;
		} finally {
			loading = false;
		}
	}

	async function showError(error: string) {
		message = error;
		await tick();
		feedback?.focus();
	}

	async function createSchedule(event: SubmitEvent) {
		event.preventDefault();
		if (busy || loading || loadFailed) return;
		const trimmedName = name.trim();
		const recipientEmails = recipients.split(',').map((email) => email.trim().toLowerCase());
		if (!trimmedName) return showError(m.ui_name_required());
		if (
			recipientEmails.length > MAX_REPORT_SCHEDULE_RECIPIENTS ||
			new Set(recipientEmails).size !== recipientEmails.length ||
			!recipientEmails.every(isScheduleEmail)
		)
			return showError(m.report_schedule_recipient_invalid());

		message = '';
		busy = true;
		try {
			const schedule = await apiFetch<Schedule>(endpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: trimmedName, cronExpression, recipientEmails, reportRange }),
				silent: true
			});
			schedules = [...schedules, schedule];
			name = '';
			recipients = '';
			cronExpression = weekly;
			reportRange = defaultRange;
			toast.success(m.report_schedule_saved());
		} catch {
			await showError(m.ui_save_failed());
		} finally {
			busy = false;
		}
		if (!message) {
			await tick();
			nameInput?.focus();
		}
	}

	async function updateSchedule(schedule: Schedule, remove = false) {
		if (busy || loading) return;
		if (remove && !window.confirm(m.report_schedule_delete_confirm({ name: schedule.name })))
			return;
		message = '';
		busy = true;
		try {
			const url = endpoint + '/' + schedule.id;
			if (remove) {
				await apiFetch(url, { method: 'DELETE', silent: true });
				schedules = schedules.filter(({ id }) => id !== schedule.id);
				toast.success(m.report_schedule_deleted());
			} else {
				const updated = await apiFetch<Schedule>(url, {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ enabled: !schedule.enabled }),
					silent: true
				});
				schedules = schedules.map((item) => (item.id === updated.id ? updated : item));
			}
		} catch {
			await showError(m.ui_load_failed_description());
		} finally {
			busy = false;
		}
		if (remove && !message) {
			await tick();
			nameInput?.focus();
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content
		showCloseButton={!busy}
		escapeKeydownBehavior={busy ? 'ignore' : 'close'}
		interactOutsideBehavior="ignore"
	>
		<Dialog.Header>
			<Dialog.Title>{m.report_schedule()}</Dialog.Title>
			<Dialog.Description>{m.report_schedule_description({ timeZone })}</Dialog.Description>
		</Dialog.Header>
		{#if message}
			<p role="alert" tabindex="-1" bind:this={feedback} class="text-sm text-destructive">
				{message}
			</p>
		{/if}
		<form onsubmit={createSchedule} aria-busy={busy}>
			<fieldset disabled={busy || loading || loadFailed} class="min-w-0 space-y-3">
				<label class="block space-y-1 text-sm font-medium">
					<span>{m.report_schedule_name()}</span>
					<Input
						bind:ref={nameInput}
						bind:value={name}
						maxlength={MAX_REPORT_SCHEDULE_NAME_LENGTH}
						required
					/>
				</label>
				<div class="grid gap-3 sm:grid-cols-2">
					<label class="block space-y-1 text-sm font-medium">
						<span>{m.report_schedule_frequency()}</span>
						<select bind:value={cronExpression} class={selectClass}>
							<option value={weekly}>{m.report_schedule_weekly()}</option>
							<option value={monthly}>{m.report_schedule_monthly()}</option>
						</select>
					</label>
					<label class="block space-y-1 text-sm font-medium">
						<span>{m.report_schedule_range()}</span>
						<select bind:value={reportRange} class={selectClass}>
							{#each ranges as [value, label] (value)}
								<option {value}>{label()}</option>
							{/each}
						</select>
					</label>
				</div>
				<div class="space-y-1">
					<label for="schedule-recipients" class="text-sm font-medium"
						>{m.report_schedule_recipients()}</label
					>
					<Input
						id="schedule-recipients"
						bind:value={recipients}
						aria-describedby="schedule-recipient-hint"
						required
					/>
					<p id="schedule-recipient-hint" class="text-xs text-muted-foreground">
						{m.report_schedule_recipient_hint()}
					</p>
				</div>
				<Button type="submit" class="w-full sm:w-auto">{m.report_schedule_create()}</Button>
			</fieldset>
		</form>
		{#if loading}
			<p role="status" class="text-sm text-muted-foreground">{m.common_loading()}</p>
		{:else if loadFailed}
			<div class="space-y-2">
				<p role="alert" class="text-sm text-destructive">{m.ui_load_failed()}</p>
				<Button
					variant="outline"
					onclick={async () => {
						await loadSchedules();
						await tick();
						nameInput?.focus();
					}}>{m.ui_try_again()}</Button
				>
			</div>
		{:else if !schedules.length}
			<p role="status" class="text-sm text-muted-foreground">{m.report_schedule_empty()}</p>
		{:else}
			<ul class="divide-y border-t">
				{#each schedules as schedule (schedule.id)}
					<li class="flex flex-wrap items-center justify-between gap-2 py-3">
						<div class="min-w-0 [overflow-wrap:anywhere]">
							<p class="text-sm font-medium">{schedule.name}</p>
							<p class="text-xs text-muted-foreground">
								{schedule.cronExpression === weekly
									? m.report_schedule_weekly()
									: schedule.cronExpression === monthly
										? m.report_schedule_monthly()
										: schedule.cronExpression}
								· {ranges.get(schedule.reportRange)?.() ?? schedule.reportRange}
								· {m.common_recipients({ count: schedule.recipientEmails.length })}
								{#if schedule.lastSentAt}
									· {m.report_schedule_last_sent()}
									{new Date(schedule.lastSentAt).toLocaleDateString(getLocale())}
								{/if}
							</p>
						</div>
						<div class="flex flex-wrap gap-2">
							<Button
								variant="outline"
								size="sm"
								role="switch"
								aria-checked={schedule.enabled}
								aria-label={m.report_schedule_enabled() + ' · ' + schedule.name}
								aria-disabled={busy}
								onclick={() => updateSchedule(schedule)}
							>
								<span
									aria-hidden="true"
									class="relative inline-flex h-4 w-7 items-center rounded-full border transition-colors {schedule.enabled
										? 'border-primary bg-primary'
										: 'border-muted-foreground bg-muted'}"
								>
									<span
										class="absolute size-2.5 rounded-full {schedule.enabled
											? 'end-0.5 bg-primary-foreground'
											: 'start-0.5 bg-muted-foreground'}"
									></span>
								</span>
								{m.report_schedule_enabled()}
							</Button>
							<Button
								variant="outline"
								size="sm"
								aria-disabled={busy}
								onclick={() => updateSchedule(schedule, true)}
							>
								{m.common_delete()}<span class="sr-only"> {schedule.name}</span>
							</Button>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</Dialog.Content>
</Dialog.Root>
