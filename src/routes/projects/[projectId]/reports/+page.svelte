<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { apiPost, apiDelete, apiFetch } from '$lib/api-client';
	import { toast } from 'svelte-sonner';
	import ReportFilters from './ReportFilters.svelte';
	import ReportSummaryCards from './ReportSummaryCards.svelte';
	import ReportCharts from './ReportCharts.svelte';

	let { data } = $props();

	// ── Share dialog state ──
	let shareDialogOpen = $state(false);
	let shareName = $state('');
	let shareExpiresDays = $state(0);
	let sharedLinks = $state<Array<{ id: number; token: string; name: string; expiresAt: string | null; createdAt: string }>>([]);
	let shareLoading = $state(false);

	// ── Schedule dialog state ──
	let scheduleDialogOpen = $state(false);
	let schedules = $state<Array<{ id: number; name: string; cronExpression: string; recipientEmails: string[]; reportRange: string; enabled: boolean; lastSentAt: string | null }>>([]);
	let newScheduleName = $state('');
	let newScheduleCron = $state('0 9 * * 1');
	let newScheduleEmails = $state('');
	let newScheduleRange = $state('last_7_days');
	let scheduleLoading = $state(false);

	const projectId = $derived(data.project.id);
	const isAdmin = $derived(data.userRole === 'PROJECT_ADMIN');

	function getPdfUrl(): string {
		const params = new URLSearchParams();
		if (data.dateRange.allTime) {
			params.set('preset', 'all');
		} else {
			if (data.dateRange.from) params.set('from', data.dateRange.from);
			if (data.dateRange.to) params.set('to', data.dateRange.to);
		}
		return `/api/projects/${projectId}/reports/pdf?${params.toString()}`;
	}

	async function openShareDialog() {
		shareDialogOpen = true;
		shareLoading = true;
		try {
			sharedLinks = await apiFetch(`/api/projects/${projectId}/reports/share`);
		} catch { /* handled by apiFetch */ }
		shareLoading = false;
	}

	async function createShareLink() {
		if (!shareName.trim()) return;
		const config: Record<string, string> = {};
		if (data.dateRange.allTime) {
			config.preset = 'all';
		} else {
			if (data.dateRange.from) config.from = data.dateRange.from;
			if (data.dateRange.to) config.to = data.dateRange.to;
		}
		try {
			await apiPost(`/api/projects/${projectId}/reports/share`, {
				name: shareName.trim(),
				config,
				expiresInDays: shareExpiresDays > 0 ? shareExpiresDays : undefined
			});
			toast.success(m.report_share_created());
			shareName = '';
			shareExpiresDays = 0;
			sharedLinks = await apiFetch(`/api/projects/${projectId}/reports/share`);
		} catch { /* handled by apiFetch */ }
	}

	async function revokeShareLink(id: number) {
		try {
			await apiDelete(`/api/projects/${projectId}/reports/share/${id}`);
			toast.success(m.report_share_revoked());
			sharedLinks = sharedLinks.filter((l) => l.id !== id);
		} catch { /* handled by apiFetch */ }
	}

	function copyShareLink(token: string) {
		const url = `${window.location.origin}/shared/${token}`;
		navigator.clipboard.writeText(url);
		toast.success(m.report_share_copied());
	}

	async function openScheduleDialog() {
		scheduleDialogOpen = true;
		scheduleLoading = true;
		try {
			schedules = await apiFetch(`/api/projects/${projectId}/reports/schedules`);
		} catch { /* handled by apiFetch */ }
		scheduleLoading = false;
	}

	async function createSchedule() {
		if (!newScheduleName.trim() || !newScheduleEmails.trim()) return;
		const emails = newScheduleEmails.split(',').map((e) => e.trim()).filter(Boolean);
		try {
			await apiPost(`/api/projects/${projectId}/reports/schedules`, {
				name: newScheduleName.trim(),
				cronExpression: newScheduleCron,
				recipientEmails: emails,
				reportRange: newScheduleRange
			});
			toast.success(m.report_schedule_saved());
			newScheduleName = '';
			newScheduleEmails = '';
			newScheduleCron = '0 9 * * 1';
			newScheduleRange = 'last_7_days';
			schedules = await apiFetch(`/api/projects/${projectId}/reports/schedules`);
		} catch { /* handled by apiFetch */ }
	}

	async function toggleSchedule(id: number, enabled: boolean) {
		try {
			await apiFetch(`/api/projects/${projectId}/reports/schedules/${id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ enabled })
			});
			schedules = schedules.map((s) => (s.id === id ? { ...s, enabled } : s));
		} catch { /* handled by apiFetch */ }
	}

	async function deleteSchedule(id: number) {
		try {
			await apiDelete(`/api/projects/${projectId}/reports/schedules/${id}`);
			toast.success(m.report_schedule_deleted());
			schedules = schedules.filter((s) => s.id !== id);
		} catch { /* handled by apiFetch */ }
	}
</script>

<div class="space-y-4">
	<!-- Date Range Filter -->
	<ReportFilters
		dateRange={data.dateRange}
		{isAdmin}
		onExportPdf={() => window.open(getPdfUrl(), '_blank')}
		onOpenShareDialog={openShareDialog}
		onOpenScheduleDialog={openScheduleDialog}
	/>

	<!-- Environment Breakdown -->
	<ReportSummaryCards envStats={data.envStats} />

	<!-- Charts, Tables, and Stats -->
	<ReportCharts
		{projectId}
		recentRuns={data.recentRuns}
		dailyResults={data.dailyResults}
		priorityStats={data.priorityStats}
		creatorStats={data.creatorStats}
		assigneeStats={data.assigneeStats}
		executorStats={data.executorStats}
		topFailingCases={data.topFailingCases}
		flakyTests={data.flakyTests}
		staleTests={data.staleTests}
		slowestTests={data.slowestTests}
		defectDensity={data.defectDensity}
		projectPriorities={data.projectPriorities}
	/>
</div>

<!-- Share Dialog -->
<Dialog.Root bind:open={shareDialogOpen}>
	<Dialog.Content class="max-w-lg">
		<Dialog.Header>
			<Dialog.Title>{m.report_share()}</Dialog.Title>
		</Dialog.Header>
		<div class="space-y-4">
			<!-- Create new share link -->
			<div class="space-y-2">
				<label for="share-name" class="text-sm font-medium">{m.report_share_name()}</label>
				<input
					id="share-name"
					type="text"
					bind:value={shareName}
					placeholder={m.report_share_name()}
					class="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
				/>
				<div class="flex items-center gap-2">
					<label for="share-expires" class="text-sm">{m.report_share_expires()}</label>
					<input
						id="share-expires"
						type="number"
						bind:value={shareExpiresDays}
						min="0"
						class="border-input bg-background w-20 rounded-md border px-2 py-1 text-sm"
					/>
					<span class="text-muted-foreground text-xs">({m.report_share_never_expires()})</span>
				</div>
				<Button size="sm" onclick={createShareLink} disabled={!shareName.trim()}>
					{m.report_share()}
				</Button>
			</div>

			<!-- Existing share links -->
			{#if shareLoading}
				<p class="text-muted-foreground text-sm">Loading...</p>
			{:else if sharedLinks.length === 0}
				<p class="text-muted-foreground text-sm">{m.report_share_empty()}</p>
			{:else}
				<div class="divide-y">
					{#each sharedLinks as link (link.id)}
						<div class="flex items-center justify-between py-2">
							<div>
								<p class="text-sm font-medium">{link.name}</p>
								<p class="text-muted-foreground text-xs">
									{link.expiresAt ? `Expires: ${new Date(link.expiresAt).toLocaleDateString()}` : m.report_share_never_expires()}
								</p>
							</div>
							<div class="flex gap-1">
								<Button size="sm" variant="outline" class="h-7 text-xs" onclick={() => copyShareLink(link.token)}>
									{m.report_share_copy()}
								</Button>
								<Button size="sm" variant="destructive" class="h-7 text-xs" onclick={() => revokeShareLink(link.id)}>
									{m.report_share_revoke()}
								</Button>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</Dialog.Content>
</Dialog.Root>

<!-- Schedule Dialog -->
{#if isAdmin}
	<Dialog.Root bind:open={scheduleDialogOpen}>
		<Dialog.Content class="max-w-lg">
			<Dialog.Header>
				<Dialog.Title>{m.report_schedule()}</Dialog.Title>
			</Dialog.Header>
			<div class="space-y-4">
				<!-- Create new schedule -->
				<div class="space-y-2 rounded-lg border p-3">
					<h4 class="text-sm font-medium">{m.report_schedule_create()}</h4>
					<input
						type="text"
						bind:value={newScheduleName}
						placeholder={m.report_schedule_name()}
						class="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
					/>
					<div class="flex gap-2">
						<select
							bind:value={newScheduleCron}
							class="border-input bg-background rounded-md border px-2 py-1 text-sm"
						>
							<option value="0 9 * * 1">{m.report_schedule_weekly()}</option>
							<option value="0 9 1 * *">{m.report_schedule_monthly()}</option>
						</select>
						<select
							bind:value={newScheduleRange}
							class="border-input bg-background rounded-md border px-2 py-1 text-sm"
						>
							<option value="last_7_days">Last 7 days</option>
							<option value="last_30_days">Last 30 days</option>
							<option value="all">All time</option>
						</select>
					</div>
					<input
						type="text"
						bind:value={newScheduleEmails}
						placeholder={m.report_schedule_recipients() + ' (comma-separated)'}
						class="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
					/>
					<Button size="sm" onclick={createSchedule} disabled={!newScheduleName.trim() || !newScheduleEmails.trim()}>
						{m.report_schedule_create()}
					</Button>
				</div>

				<!-- Existing schedules -->
				{#if scheduleLoading}
					<p class="text-muted-foreground text-sm">Loading...</p>
				{:else if schedules.length === 0}
					<p class="text-muted-foreground text-sm">{m.report_schedule_empty()}</p>
				{:else}
					<div class="divide-y">
						{#each schedules as sched (sched.id)}
							<div class="flex items-center justify-between py-2">
								<div>
									<p class="text-sm font-medium">{sched.name}</p>
									<p class="text-muted-foreground text-xs">
										{sched.cronExpression} &middot; {sched.recipientEmails.length} recipients
										{#if sched.lastSentAt}
											&middot; {m.report_schedule_last_sent()}: {new Date(sched.lastSentAt).toLocaleDateString()}
										{/if}
									</p>
								</div>
								<div class="flex items-center gap-1">
									<input
										type="checkbox"
										checked={sched.enabled}
										onchange={() => toggleSchedule(sched.id, !sched.enabled)}
										class="h-4 w-4"
									/>
									<Button size="sm" variant="destructive" class="h-7 text-xs" onclick={() => deleteSchedule(sched.id)}>
										{m.common_delete()}
									</Button>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</Dialog.Content>
	</Dialog.Root>
{/if}
