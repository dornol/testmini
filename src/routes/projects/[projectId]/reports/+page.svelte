<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import PriorityBadge from '$lib/components/PriorityBadge.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import Chart from '$lib/components/Chart.svelte';
	import type { ChartConfiguration } from 'chart.js';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/stores';
	import { SvelteSet } from 'svelte/reactivity';
	import { apiPost, apiDelete, apiFetch } from '$lib/api-client';
	import { toast } from 'svelte-sonner';

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

	const envStats = $derived(data.envStats);
	const recentRuns = $derived(data.recentRuns);
	const priorityStats = $derived(data.priorityStats);
	const creatorStats = $derived(data.creatorStats);
	const assigneeStats = $derived(data.assigneeStats);
	const dailyResults = $derived(data.dailyResults);
	const executorStats = $derived(data.executorStats);
	const topFailingCases = $derived(data.topFailingCases);
	const flakyTests = $derived(data.flakyTests);
	const staleTests = $derived(data.staleTests);
	const dateRange = $derived(data.dateRange);

	// Active filter state — derived from server data.
	// fromInput / toInput are for the custom date picker inputs.
	const isAllTime = $derived(dateRange.allTime);
	const fromInput = $derived(dateRange.from ?? '');
	const toInput = $derived(dateRange.to ?? '');

	// Pending custom input values (local only, not reactive to server data).
	let pendingFrom = $state('');
	let pendingTo = $state('');

	let selectedRunIds = new SvelteSet<number>();

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

	function toggleRun(id: number) {
		if (selectedRunIds.has(id)) {
			selectedRunIds.delete(id);
		} else {
			selectedRunIds.add(id);
		}
	}

	function toggleAll() {
		if (selectedRunIds.size === recentRuns.length) {
			selectedRunIds.clear();
		} else {
			selectedRunIds.clear();
			recentRuns.forEach((r) => selectedRunIds.add(r.id));
		}
	}

	function exportSelected() {
		const ids = Array.from(selectedRunIds).join(',');
		window.location.href = `/api/projects/${data.project.id}/reports/export?runs=${ids}`;
	}

	const trendBarConfig = $derived<ChartConfiguration>({
		type: 'bar',
		data: {
			labels: recentRuns.map((r) =>
				r.name.length > 10 ? r.name.slice(0, 10) + '..' : r.name
			),
			datasets: [
				{
					label: m.reports_pass(),
					data: recentRuns.map((r) => r.passCount),
					backgroundColor: '#22c55e'
				},
				{
					label: m.reports_fail(),
					data: recentRuns.map((r) => r.failCount),
					backgroundColor: '#ef4444'
				},
				{
					label: m.dashboard_blocked(),
					data: recentRuns.map((r) => r.blockedCount),
					backgroundColor: '#f97316'
				},
				{
					label: m.dashboard_skipped(),
					data: recentRuns.map((r) => r.skippedCount),
					backgroundColor: '#9ca3af'
				}
			]
		},
		options: {
			responsive: true,
			plugins: { legend: { position: 'bottom' } },
			scales: {
				x: { stacked: true },
				y: { stacked: true, beginAtZero: true }
			}
		}
	});

	const dailyBarConfig = $derived<ChartConfiguration>({
		type: 'bar',
		data: {
			labels: dailyResults.map((d) => d.date),
			datasets: [
				{
					label: m.reports_pass(),
					data: dailyResults.map((d) => d.passCount),
					backgroundColor: '#22c55e'
				},
				{
					label: m.reports_fail(),
					data: dailyResults.map((d) => d.failCount),
					backgroundColor: '#ef4444'
				},
				{
					label: m.dashboard_blocked(),
					data: dailyResults.map((d) => d.blockedCount),
					backgroundColor: '#f97316'
				},
				{
					label: m.dashboard_skipped(),
					data: dailyResults.map((d) => d.skippedCount),
					backgroundColor: '#9ca3af'
				}
			]
		},
		options: {
			responsive: true,
			plugins: { legend: { position: 'bottom' } },
			scales: {
				x: { stacked: true },
				y: { stacked: true, beginAtZero: true }
			}
		}
	});

	function passRate(pass: number, total: number): string {
		if (total === 0) return '-';
		return `${Math.round((pass / total) * 100)}%`;
	}

	function getPriorityColor(name: string): string {
		return data.projectPriorities.find((p) => p.name === name)?.color ?? '#6b7280';
	}

	function barWidth(value: number, total: number): string {
		if (total === 0) return '0%';
		return `${(value / total) * 100}%`;
	}
</script>

<div class="space-y-4">
	<!-- Date Range Filter -->
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
					<Button size="sm" variant="outline" class="h-7 text-xs" onclick={() => window.open(getPdfUrl(), '_blank')}>
						{m.report_export_pdf()}
					</Button>
					<Button size="sm" variant="outline" class="h-7 text-xs" onclick={openShareDialog}>
						{m.report_share()}
					</Button>
					{#if isAdmin}
						<Button size="sm" variant="outline" class="h-7 text-xs" onclick={openScheduleDialog}>
							{m.report_schedule()}
						</Button>
					{/if}
				</div>
			</div>
		</Card.Content>
	</Card.Root>

	<!-- Environment Breakdown -->
	<Card.Root>
		<Card.Header>
			<Card.Title class="text-sm font-medium">{m.reports_env_pass_rate()}</Card.Title>
		</Card.Header>
		<Card.Content>
			{#if envStats.length === 0}
				<p class="text-muted-foreground text-sm">{m.reports_no_runs()}</p>
			{:else}
				<div class="grid gap-4 sm:grid-cols-2">
					{#each envStats as env (env.environment)}
						{@const rate = env.totalExecs > 0 ? Math.round((env.passCount / env.totalExecs) * 100) : 0}
						<div class="rounded-lg border p-4">
							<div class="flex items-center justify-between">
								<Badge variant="outline">{env.environment}</Badge>
								<span class="text-2xl font-bold {rate >= 80 ? 'text-green-600' : rate >= 50 ? 'text-yellow-600' : env.totalExecs === 0 ? '' : 'text-red-600'}">
									{env.totalExecs > 0 ? `${rate}%` : '-'}
								</span>
							</div>
							<div class="mt-3 space-y-1">
								<div class="bg-secondary flex h-2 overflow-hidden rounded-full">
									{#if env.passCount > 0}
										<div class="bg-green-500" style="width: {barWidth(env.passCount, env.totalExecs)}"></div>
									{/if}
									{#if env.failCount > 0}
										<div class="bg-red-500" style="width: {barWidth(env.failCount, env.totalExecs)}"></div>
									{/if}
								</div>
								<div class="text-muted-foreground flex justify-between text-xs">
									<span>{m.reports_runs_count({ count: env.totalRuns })}</span>
									<span>{m.reports_pass_fail({ pass: env.passCount, fail: env.failCount })}</span>
								</div>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</Card.Content>
	</Card.Root>

	<!-- Pass Rate Trend (bar chart) -->
	{#if recentRuns.length > 0}
		<Card.Root>
			<Card.Header>
				<Card.Title class="text-sm font-medium">{m.reports_trend_title()}</Card.Title>
			</Card.Header>
			<Card.Content>
				<Chart config={trendBarConfig} />
			</Card.Content>
		</Card.Root>
	{/if}

	<!-- Daily Test Run Results (stacked bar chart) -->
	{#if dailyResults.length > 0}
		<Card.Root>
			<Card.Header>
				<Card.Title class="text-sm font-medium">{m.reports_daily_results()}</Card.Title>
			</Card.Header>
			<Card.Content>
				<Chart config={dailyBarConfig} />
			</Card.Content>
		</Card.Root>
	{/if}

	<!-- Priority Breakdown -->
	{#if priorityStats.length > 0}
		<Card.Root>
			<Card.Header>
				<Card.Title class="text-sm font-medium">{m.reports_by_priority()}</Card.Title>
			</Card.Header>
			<Card.Content class="p-0">
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>{m.common_priority()}</Table.Head>
							<Table.Head class="w-28">{m.reports_total()}</Table.Head>
							<Table.Head class="w-28">{m.reports_pass()}</Table.Head>
							<Table.Head class="w-28">{m.reports_fail()}</Table.Head>
							<Table.Head class="w-28">{m.reports_pass_rate()}</Table.Head>
							<Table.Head class="w-40">{m.reports_distribution()}</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each priorityStats as ps (ps.priority)}
							{@const total = ps.total}
							{@const pass = ps.passCount}
							{@const fail = ps.failCount}
							<Table.Row>
								<Table.Cell>
									<PriorityBadge name={ps.priority} color={getPriorityColor(ps.priority)} />
								</Table.Cell>
								<Table.Cell>{total}</Table.Cell>
								<Table.Cell class="text-green-600">{pass}</Table.Cell>
								<Table.Cell class="text-red-600">{fail}</Table.Cell>
								<Table.Cell class="font-medium">{passRate(pass, total)}</Table.Cell>
								<Table.Cell>
									<div class="bg-secondary flex h-2 w-full overflow-hidden rounded-full">
										{#if pass > 0}
											<div class="bg-green-500" style="width: {barWidth(pass, total)}"></div>
										{/if}
										{#if fail > 0}
											<div class="bg-red-500" style="width: {barWidth(fail, total)}"></div>
										{/if}
									</div>
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</Card.Content>
		</Card.Root>
	{/if}

	<!-- Test Cases by Creator -->
	{#if creatorStats.length > 0}
		{@const maxCreatorCount = Math.max(...creatorStats.map((c) => c.caseCount))}
		<Card.Root>
			<Card.Header>
				<Card.Title class="text-sm font-medium">{m.reports_by_creator()}</Card.Title>
			</Card.Header>
			<Card.Content class="p-0">
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>{m.reports_creator()}</Table.Head>
							<Table.Head class="w-28">{m.reports_case_count()}</Table.Head>
							<Table.Head class="w-40">{m.reports_distribution()}</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each creatorStats as cs (cs.userId)}
							<Table.Row>
								<Table.Cell class="font-medium">{cs.userName}</Table.Cell>
								<Table.Cell>{cs.caseCount}</Table.Cell>
								<Table.Cell>
									<div class="bg-secondary flex h-2 w-full overflow-hidden rounded-full">
										<div class="bg-blue-500" style="width: {barWidth(cs.caseCount, maxCreatorCount)}"></div>
									</div>
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</Card.Content>
		</Card.Root>
	{/if}

	<!-- Pass/Fail Rate by Assignee -->
	{#if assigneeStats.length > 0}
		<Card.Root>
			<Card.Header>
				<Card.Title class="text-sm font-medium">{m.reports_by_assignee()}</Card.Title>
			</Card.Header>
			<Card.Content class="p-0">
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>{m.reports_assignee()}</Table.Head>
							<Table.Head class="w-28">{m.reports_assigned()}</Table.Head>
							<Table.Head class="w-28">{m.reports_pass()}</Table.Head>
							<Table.Head class="w-28">{m.reports_fail()}</Table.Head>
							<Table.Head class="w-28">{m.reports_pass_rate()}</Table.Head>
							<Table.Head class="w-40">{m.reports_distribution()}</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each assigneeStats as as_ (as_.userId)}
							{@const total = as_.totalExecs}
							{@const pass = as_.passCount}
							{@const fail = as_.failCount}
							<Table.Row>
								<Table.Cell class="font-medium">{as_.userName}</Table.Cell>
								<Table.Cell>{as_.assignedCount}</Table.Cell>
								<Table.Cell class="text-green-600">{pass}</Table.Cell>
								<Table.Cell class="text-red-600">{fail}</Table.Cell>
								<Table.Cell class="font-medium">{passRate(pass, total)}</Table.Cell>
								<Table.Cell>
									<div class="bg-secondary flex h-2 w-full overflow-hidden rounded-full">
										{#if pass > 0}
											<div class="bg-green-500" style="width: {barWidth(pass, total)}"></div>
										{/if}
										{#if fail > 0}
											<div class="bg-red-500" style="width: {barWidth(fail, total)}"></div>
										{/if}
									</div>
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</Card.Content>
		</Card.Root>
	{/if}

	<!-- Activity by Executor -->
	{#if executorStats.length > 0}
		{@const maxExecCount = Math.max(...executorStats.map((e) => e.execCount))}
		<Card.Root>
			<Card.Header>
				<Card.Title class="text-sm font-medium">{m.reports_by_executor()}</Card.Title>
			</Card.Header>
			<Card.Content class="p-0">
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>{m.reports_executor()}</Table.Head>
							<Table.Head class="w-28">{m.reports_executions()}</Table.Head>
							<Table.Head class="w-28">{m.reports_pass()}</Table.Head>
							<Table.Head class="w-28">{m.reports_fail()}</Table.Head>
							<Table.Head class="w-28">{m.reports_pass_rate()}</Table.Head>
							<Table.Head class="w-40">{m.reports_distribution()}</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each executorStats as es (es.userId)}
							{@const total = es.execCount}
							{@const pass = es.passCount}
							{@const fail = es.failCount}
							<Table.Row>
								<Table.Cell class="font-medium">{es.userName}</Table.Cell>
								<Table.Cell>{total}</Table.Cell>
								<Table.Cell class="text-green-600">{pass}</Table.Cell>
								<Table.Cell class="text-red-600">{fail}</Table.Cell>
								<Table.Cell class="font-medium">{passRate(pass, total)}</Table.Cell>
								<Table.Cell>
									<div class="bg-secondary flex h-2 w-full overflow-hidden rounded-full">
										{#if pass > 0}
											<div class="bg-green-500" style="width: {barWidth(pass, total)}"></div>
										{/if}
										{#if fail > 0}
											<div class="bg-red-500" style="width: {barWidth(fail, total)}"></div>
										{/if}
									</div>
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</Card.Content>
		</Card.Root>
	{/if}

	<!-- Top Failing Test Cases -->
	{#if topFailingCases.length > 0}
		{@const maxFailCount = Math.max(...topFailingCases.map((t) => t.failCount))}
		<Card.Root>
			<Card.Header>
				<Card.Title class="text-sm font-medium">{m.reports_top_failing()}</Card.Title>
			</Card.Header>
			<Card.Content class="p-0">
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>{m.reports_test_case()}</Table.Head>
							<Table.Head class="w-28">{m.reports_total()}</Table.Head>
							<Table.Head class="w-28">{m.reports_fail_count()}</Table.Head>
							<Table.Head class="w-28">{m.reports_pass()}</Table.Head>
							<Table.Head class="w-28">{m.reports_pass_rate()}</Table.Head>
							<Table.Head class="w-40">{m.reports_distribution()}</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each topFailingCases as tc (tc.testCaseId)}
							{@const total = tc.totalExecs}
							{@const fail = tc.failCount}
							{@const pass = tc.passCount}
							<Table.Row
								class="cursor-pointer"
								onclick={() => { window.location.href = `/projects/${data.project.id}/test-cases/${tc.testCaseId}`; }}
							>
								<Table.Cell>
									<div>
										<span class="text-muted-foreground text-xs">{tc.testCaseKey}</span>
										<span class="ml-1 font-medium">{tc.title}</span>
									</div>
								</Table.Cell>
								<Table.Cell>{total}</Table.Cell>
								<Table.Cell class="text-red-600 font-medium">{fail}</Table.Cell>
								<Table.Cell class="text-green-600">{pass}</Table.Cell>
								<Table.Cell class="font-medium">{passRate(pass, total)}</Table.Cell>
								<Table.Cell>
									<div class="bg-secondary flex h-2 w-full overflow-hidden rounded-full">
										{#if pass > 0}
											<div class="bg-green-500" style="width: {barWidth(pass, total)}"></div>
										{/if}
										{#if fail > 0}
											<div class="bg-red-500" style="width: {barWidth(fail, total)}"></div>
										{/if}
									</div>
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</Card.Content>
		</Card.Root>
	{/if}

	<!-- Flaky Tests -->
	{#if flakyTests.length > 0}
		<Card.Root>
			<Card.Header>
				<Card.Title class="text-sm font-medium">{m.trends_flaky_tests()}</Card.Title>
				<Card.Description>{m.trends_flaky_desc()}</Card.Description>
			</Card.Header>
			<Card.Content class="p-0">
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>{m.reports_test_case()}</Table.Head>
							<Table.Head class="w-28">{m.reports_total()}</Table.Head>
							<Table.Head class="w-28">{m.trends_pass()}</Table.Head>
							<Table.Head class="w-28">{m.trends_fail()}</Table.Head>
							<Table.Head class="w-28">{m.reports_pass_rate()}</Table.Head>
							<Table.Head class="w-40">{m.reports_distribution()}</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each flakyTests as tc (tc.testCaseId)}
							{@const total = tc.totalExecs}
							{@const pass = tc.passCount}
							{@const fail = tc.failCount}
							<Table.Row
								class="cursor-pointer"
								onclick={() => { window.location.href = `/projects/${data.project.id}/test-cases/${tc.testCaseId}`; }}
							>
								<Table.Cell>
									<div class="flex items-center gap-2">
										<Badge variant="outline" class="bg-yellow-50 text-yellow-700 border-yellow-300 text-xs">Flaky</Badge>
										<div>
											<span class="text-muted-foreground text-xs">{tc.testCaseKey}</span>
											<span class="ml-1 font-medium">{tc.title}</span>
										</div>
									</div>
								</Table.Cell>
								<Table.Cell>{total}</Table.Cell>
								<Table.Cell class="text-green-600">{pass}</Table.Cell>
								<Table.Cell class="text-red-600 font-medium">{fail}</Table.Cell>
								<Table.Cell class="font-medium">{passRate(pass, total)}</Table.Cell>
								<Table.Cell>
									<div class="bg-secondary flex h-2 w-full overflow-hidden rounded-full">
										{#if pass > 0}
											<div class="bg-green-500" style="width: {barWidth(pass, total)}"></div>
										{/if}
										{#if fail > 0}
											<div class="bg-red-500" style="width: {barWidth(fail, total)}"></div>
										{/if}
									</div>
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</Card.Content>
		</Card.Root>
	{/if}

	<!-- Stale Test Cases -->
	{#if staleTests.length > 0}
		<Card.Root>
			<Card.Header>
				<Card.Title class="text-sm font-medium">{m.stale_tests_title()}</Card.Title>
				<Card.Description>{m.stale_tests_desc()}</Card.Description>
			</Card.Header>
			<Card.Content class="p-0">
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>{m.reports_test_case()}</Table.Head>
							<Table.Head class="w-28">{m.common_priority()}</Table.Head>
							<Table.Head class="w-36">{m.stale_tests_last_executed()}</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each staleTests as tc (tc.testCaseId)}
							{@const daysAgo = tc.lastExecutedAt ? Math.floor((Date.now() - new Date(tc.lastExecutedAt).getTime()) / 86400000) : null}
							<Table.Row
								class="cursor-pointer"
								onclick={() => { window.location.href = `/projects/${data.project.id}/test-cases/${tc.testCaseId}`; }}
							>
								<Table.Cell>
									<div>
										<span class="text-muted-foreground text-xs">{tc.testCaseKey}</span>
										<span class="ml-1 font-medium">{tc.title}</span>
									</div>
								</Table.Cell>
								<Table.Cell>
									<PriorityBadge name={tc.priority} color={getPriorityColor(tc.priority)} />
								</Table.Cell>
								<Table.Cell>
									{#if daysAgo === null}
										<Badge variant="outline" class="bg-red-50 text-red-700 border-red-300 text-xs">{m.stale_tests_never()}</Badge>
									{:else}
										<span class="text-muted-foreground text-sm {daysAgo > 30 ? 'text-yellow-600 font-medium' : ''}">{m.stale_tests_days_ago({ days: daysAgo })}</span>
									{/if}
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</Card.Content>
		</Card.Root>
	{/if}

	<!-- Recent Completed Runs Table -->
	{#if recentRuns.length > 0}
		<Card.Root>
			<Card.Header class="flex flex-row items-center justify-between">
				<Card.Title class="text-sm font-medium">{m.reports_recent_completed()}</Card.Title>
				{#if selectedRunIds.size > 0}
					<Button size="sm" class="h-7 text-xs" onclick={exportSelected}>
						{m.reports_export_selected({ count: selectedRunIds.size })}
					</Button>
				{/if}
			</Card.Header>
			<Card.Content class="p-0">
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head class="w-10 px-2">
								<input
									type="checkbox"
									checked={recentRuns.length > 0 && selectedRunIds.size === recentRuns.length}
									onchange={toggleAll}
									aria-label={m.reports_select_all()}
									class="h-4 w-4 rounded border-gray-300"
								/>
							</Table.Head>
							<Table.Head>{m.common_name()}</Table.Head>
							<Table.Head class="w-24">{m.dashboard_env()}</Table.Head>
							<Table.Head class="w-20">{m.reports_pass()}</Table.Head>
							<Table.Head class="w-20">{m.reports_fail()}</Table.Head>
							<Table.Head class="w-24">{m.dashboard_blocked()}</Table.Head>
							<Table.Head class="w-24">{m.dashboard_skipped()}</Table.Head>
							<Table.Head class="w-28">{m.reports_pass_rate()}</Table.Head>
							<Table.Head class="w-32">{m.reports_finished()}</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each [...recentRuns].reverse() as run (run.id)}
							{@const rate = run.totalCount > 0 ? Math.round((run.passCount / run.totalCount) * 100) : 0}
							<Table.Row
								class="cursor-pointer"
								onclick={() => { window.location.href = `/projects/${data.project.id}/test-runs/${run.id}`; }}
							>
								<Table.Cell class="px-2" onclick={(e: MouseEvent) => e.stopPropagation()}>
									<input
										type="checkbox"
										checked={selectedRunIds.has(run.id)}
										onchange={() => toggleRun(run.id)}
										class="h-4 w-4 rounded border-gray-300"
									/>
								</Table.Cell>
								<Table.Cell class="font-medium">{run.name}</Table.Cell>
								<Table.Cell>
									<Badge variant="outline">{run.environment}</Badge>
								</Table.Cell>
								<Table.Cell class="text-green-600">{run.passCount}</Table.Cell>
								<Table.Cell class="text-red-600">{run.failCount}</Table.Cell>
								<Table.Cell class="text-orange-600">{run.blockedCount}</Table.Cell>
								<Table.Cell class="text-gray-500">{run.skippedCount}</Table.Cell>
								<Table.Cell>
									<span class="font-medium {rate >= 80 ? 'text-green-600' : rate >= 50 ? 'text-yellow-600' : 'text-red-600'}">
										{rate}%
									</span>
								</Table.Cell>
								<Table.Cell class="text-muted-foreground text-xs">
									{run.finishedAt ? new Date(run.finishedAt).toLocaleDateString() : '-'}
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</Card.Content>
		</Card.Root>
	{/if}
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
