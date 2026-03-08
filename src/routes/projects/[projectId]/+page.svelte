<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { toast } from 'svelte-sonner';
	import { apiPut } from '$lib/api-client';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import Chart from '$lib/components/Chart.svelte';
	import LazyChart from '$lib/components/LazyChart.svelte';
	import type { ChartConfiguration } from 'chart.js';
	import { flip } from 'svelte/animate';
	import { untrack } from 'svelte';
	import { WIDGET_DEFINITIONS, DEFAULT_LAYOUT, SIZE_COLS } from '$lib/dashboard-widgets';
	import type { WidgetConfig } from '$lib/server/db/schema';

	let { data } = $props();
	const proj = $derived(data.project);
	const stats = $derived(data.stats);
	const recentRuns = $derived(data.recentRuns);
	const trendRuns = $derived(data.trendRuns);
	const activityLog = $derived(data.activityLog);
	const ACTIVITY_LIMIT = 20;
	let showAllActivity = $state(false);
	const visibleActivities = $derived(showAllActivity ? activityLog : activityLog.slice(0, ACTIVITY_LIMIT));

	// ── Layout state ──────────────────────────────────────
	// Read data.initialLayout once via untrack() so the $state initializer does not
	// register a reactive dependency on `data`.  After this point, `layout` is owned
	// entirely by local state and is never re-derived from props.
	let layout = $state<WidgetConfig[]>(
		untrack(() =>
			(data.initialLayout ?? DEFAULT_LAYOUT).slice().sort((a, b) => a.order - b.order)
		)
	);
	let customizeOpen = $state(false);

	// Sorted visible widgets for the main grid
	const visibleWidgets = $derived(
		layout.slice().sort((a, b) => a.order - b.order).filter((w) => w.visible)
	);

	// ── Debounced auto-save ───────────────────────────────
	let saveTimer: ReturnType<typeof setTimeout> | null = null;

	function scheduleSave() {
		if (saveTimer) clearTimeout(saveTimer);
		saveTimer = setTimeout(() => saveLayout(), 600);
	}

	async function saveLayout() {
		try {
			await apiPut(`/api/projects/${proj.id}/dashboard-layout`, { layout: $state.snapshot(layout) });
		} catch {
			// error toast handled by apiPut
		}
	}

	function toggleWidget(id: string) {
		const w = layout.find((x) => x.id === id);
		if (w) {
			w.visible = !w.visible;
			scheduleSave();
		}
	}

	function setSize(id: string, size: WidgetConfig['size']) {
		const w = layout.find((x) => x.id === id);
		if (w) {
			w.size = size;
			scheduleSave();
		}
	}

	function resetLayout() {
		layout = DEFAULT_LAYOUT.map((w) => ({ ...w }));
		scheduleSave();
	}

	// ── Drag-to-reorder ───────────────────────────────────
	let draggedId = $state<string | null>(null);
	let dragOverId = $state<string | null>(null);

	function onDragStart(id: string) {
		draggedId = id;
	}

	function onDragOver(id: string) {
		if (!draggedId || draggedId === id) return;
		dragOverId = id;

		// Recompute order by swapping the two items
		const sorted = layout.slice().sort((a, b) => a.order - b.order);
		const fromIdx = sorted.findIndex((w) => w.id === draggedId);
		const toIdx = sorted.findIndex((w) => w.id === id);
		if (fromIdx === -1 || toIdx === -1) return;

		// Shift items between the two positions
		const moved = sorted.splice(fromIdx, 1)[0];
		sorted.splice(toIdx, 0, moved);

		// Reassign order values
		sorted.forEach((w, i) => {
			const entry = layout.find((x) => x.id === w.id);
			if (entry) entry.order = i;
		});
	}

	function onDragEnd() {
		draggedId = null;
		dragOverId = null;
		scheduleSave();
	}

	// ── Chart configs ─────────────────────────────────────
	const passRate = $derived(
		stats.execCounts.total > 0
			? Math.round((stats.execCounts.pass / stats.execCounts.total) * 100)
			: 0
	);

	const executed = $derived(stats.execCounts.total - stats.execCounts.pending);

	const trendConfig = $derived<ChartConfiguration>({
		type: 'line',
		data: {
			labels: trendRuns.map((r) => (r.name.length > 10 ? r.name.slice(0, 10) + '..' : r.name)),
			datasets: [
				{
					label: m.dashboard_pass_rate(),
					data: trendRuns.map((r) =>
						r.totalCount > 0 ? Math.round((r.passCount / r.totalCount) * 100) : 0
					),
					borderColor: '#22c55e',
					backgroundColor: 'rgba(34, 197, 94, 0.1)',
					fill: true,
					tension: 0.3
				}
			]
		},
		options: {
			responsive: true,
			plugins: { legend: { display: false } },
			scales: {
				y: { min: 0, max: 100, ticks: { callback: (v) => v + '%' } }
			}
		}
	});

	const doughnutConfig = $derived<ChartConfiguration>({
		type: 'doughnut',
		data: {
			labels: [
				m.dashboard_pass(),
				m.dashboard_fail(),
				m.dashboard_blocked(),
				m.dashboard_skipped(),
				m.dashboard_pending()
			],
			datasets: [
				{
					data: [
						stats.execCounts.pass,
						stats.execCounts.fail,
						stats.execCounts.blocked,
						stats.execCounts.skipped,
						stats.execCounts.pending
					],
					backgroundColor: ['#22c55e', '#ef4444', '#f97316', '#9ca3af', '#e5e7eb']
				}
			]
		},
		options: {
			responsive: true,
			plugins: {
				legend: { position: 'bottom' }
			}
		}
	});

	// ── Helpers ───────────────────────────────────────────
	function statusVariant(s: string): 'default' | 'secondary' | 'outline' | 'destructive' {
		switch (s) {
			case 'COMPLETED':
				return 'default';
			case 'IN_PROGRESS':
				return 'secondary';
			default:
				return 'outline';
		}
	}

	function statusColor(s: string): string {
		switch (s) {
			case 'PASS':
				return 'text-green-600';
			case 'FAIL':
				return 'text-red-600';
			case 'BLOCKED':
				return 'text-orange-600';
			case 'SKIPPED':
				return 'text-gray-500';
			default:
				return 'text-muted-foreground';
		}
	}

	function timeAgo(date: Date | string): string {
		const d = typeof date === 'string' ? new Date(date) : date;
		const now = new Date();
		const diffMs = now.getTime() - d.getTime();
		const diffMin = Math.floor(diffMs / 60000);
		if (diffMin < 1) return 'just now';
		if (diffMin < 60) return `${diffMin}m ago`;
		const diffHr = Math.floor(diffMin / 60);
		if (diffHr < 24) return `${diffHr}h ago`;
		const diffDay = Math.floor(diffHr / 24);
		return `${diffDay}d ago`;
	}

	function widgetLabel(id: string): string {
		return WIDGET_DEFINITIONS.find((w) => w.id === id)?.label ?? id;
	}

	function widgetDescription(id: string): string {
		return WIDGET_DEFINITIONS.find((w) => w.id === id)?.description ?? '';
	}
</script>

<!-- ── Header Row ──────────────────────────────────────── -->
<div class="mb-4 flex items-center justify-between">
	<div></div>
	<button
		type="button"
		onclick={() => (customizeOpen = !customizeOpen)}
		class="text-muted-foreground hover:text-foreground hover:bg-accent flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors"
		aria-expanded={customizeOpen}
		aria-label="Customize dashboard layout"
	>
		<!-- Gear icon -->
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="15"
			height="15"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<path
				d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
			/>
			<circle cx="12" cy="12" r="3" />
		</svg>
		Customize
	</button>
</div>

<!-- ── Customize Panel ────────────────────────────────── -->
{#if customizeOpen}
	<div
		class="bg-card border-border mb-6 rounded-lg border p-4 shadow-sm"
		role="region"
		aria-label="Dashboard customization panel"
	>
		<div class="mb-3 flex items-center justify-between">
			<h2 class="text-sm font-semibold">Dashboard Widgets</h2>
			<div class="flex items-center gap-2">
				<button
					type="button"
					onclick={resetLayout}
					class="text-muted-foreground hover:text-foreground rounded px-2 py-1 text-xs transition-colors hover:underline"
				>
					Reset to default
				</button>
				<button
					type="button"
					onclick={() => (customizeOpen = false)}
					class="text-muted-foreground hover:text-foreground rounded p-1 transition-colors"
					aria-label="Close customize panel"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="14"
						height="14"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<path d="M18 6 6 18" /><path d="m6 6 12 12" />
					</svg>
				</button>
			</div>
		</div>

		<p class="text-muted-foreground mb-3 text-xs">
			Drag rows to reorder. Toggle visibility and choose a column size per widget.
		</p>

		<ul class="space-y-1" role="list" aria-label="Widget list">
			{#each layout.slice().sort((a, b) => a.order - b.order) as widget (widget.id)}
				<li
					animate:flip={{ duration: 200 }}
					class="bg-background border-border flex items-center gap-3 rounded-md border px-3 py-2 text-sm transition-colors
						{draggedId === widget.id ? 'opacity-50' : ''}
						{dragOverId === widget.id ? 'border-primary' : ''}"
					draggable="true"
					ondragstart={() => onDragStart(widget.id)}
					ondragover={(e) => { e.preventDefault(); onDragOver(widget.id); }}
					ondragend={onDragEnd}
					role="listitem"
				>
					<!-- Drag handle -->
					<span
						class="text-muted-foreground cursor-grab active:cursor-grabbing"
						aria-hidden="true"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="14"
							height="14"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<circle cx="9" cy="5" r="1" /><circle cx="9" cy="12" r="1" /><circle
								cx="9"
								cy="19"
								r="1"
							/><circle cx="15" cy="5" r="1" /><circle cx="15" cy="12" r="1" /><circle
								cx="15"
								cy="19"
								r="1"
							/>
						</svg>
					</span>

					<!-- Toggle visibility -->
					<button
						type="button"
						role="switch"
						aria-checked={widget.visible}
						aria-label="Toggle {widgetLabel(widget.id)} visibility"
						onclick={() => toggleWidget(widget.id)}
						class="flex h-5 w-9 shrink-0 items-center rounded-full border-2 transition-colors
							{widget.visible ? 'bg-primary border-primary' : 'bg-muted border-muted'}"
					>
						<span
							class="bg-background block h-3.5 w-3.5 rounded-full shadow transition-transform
								{widget.visible ? 'translate-x-[18px]' : 'translate-x-0.5'}"
						></span>
					</button>

					<!-- Label & description -->
					<div class="min-w-0 flex-1">
						<span class="font-medium {!widget.visible ? 'text-muted-foreground line-through' : ''}">
							{widgetLabel(widget.id)}
						</span>
						<p class="text-muted-foreground truncate text-xs">{widgetDescription(widget.id)}</p>
					</div>

					<!-- Size selector -->
					<div
						class="flex items-center gap-1 rounded-md border p-0.5"
						role="group"
						aria-label="Size for {widgetLabel(widget.id)}"
					>
						{#each (['sm', 'md', 'lg'] as const) as size (size)}
							<button
								type="button"
								onclick={() => setSize(widget.id, size)}
								class="rounded px-2 py-0.5 text-xs transition-colors
									{widget.size === size
										? 'bg-primary text-primary-foreground'
										: 'text-muted-foreground hover:bg-accent'}"
								aria-pressed={widget.size === size}
								aria-label="{size} size"
							>
								{size}
							</button>
						{/each}
					</div>
				</li>
			{/each}
		</ul>
	</div>
{/if}

<!-- ── Widget Grid ─────────────────────────────────────── -->
<div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
	{#each visibleWidgets as widget (widget.id)}
		<div class="{SIZE_COLS[widget.size]} min-w-0">
			<!-- stats_summary -->
			{#if widget.id === 'stats_summary'}
				<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
					<Card.Root>
						<Card.Header class="pb-2">
							<Card.Title class="text-muted-foreground text-sm font-medium"
								>{m.dashboard_test_cases()}</Card.Title
							>
						</Card.Header>
						<Card.Content>
							<p class="text-2xl font-bold">{stats.testCaseCount}</p>
						</Card.Content>
					</Card.Root>

					<Card.Root>
						<Card.Header class="pb-2">
							<Card.Title class="text-muted-foreground text-sm font-medium"
								>{m.dashboard_test_runs()}</Card.Title
							>
						</Card.Header>
						<Card.Content>
							<p class="text-2xl font-bold">{stats.runCounts.total}</p>
							<div class="text-muted-foreground mt-1 flex gap-2 text-xs">
								{#if stats.runCounts.inProgress > 0}
									<span class="text-blue-600"
										>{m.dashboard_in_progress({ count: stats.runCounts.inProgress })}</span
									>
								{/if}
								{#if stats.runCounts.completed > 0}
									<span class="text-green-600"
										>{m.dashboard_completed({ count: stats.runCounts.completed })}</span
									>
								{/if}
							</div>
						</Card.Content>
					</Card.Root>

					<Card.Root>
						<Card.Header class="pb-2">
							<Card.Title class="text-muted-foreground text-sm font-medium"
								>{m.dashboard_pass_rate()}</Card.Title
							>
						</Card.Header>
						<Card.Content>
							<p
								class="text-2xl font-bold {passRate >= 80
									? 'text-green-600'
									: passRate >= 50
										? 'text-yellow-600'
										: stats.execCounts.total === 0
											? ''
											: 'text-red-600'}"
							>
								{stats.execCounts.total > 0 ? `${passRate}%` : '-'}
							</p>
							{#if stats.execCounts.total > 0}
								<p class="text-muted-foreground mt-1 text-xs">
									{m.dashboard_executed({ pass: stats.execCounts.pass, executed })}
								</p>
							{/if}
						</Card.Content>
					</Card.Root>

					<Card.Root>
						<Card.Header class="pb-2">
							<Card.Title class="text-muted-foreground text-sm font-medium"
								>{m.dashboard_members()}</Card.Title
							>
						</Card.Header>
						<Card.Content>
							<p class="text-2xl font-bold">{proj.memberCount}</p>
							<p class="text-muted-foreground mt-1 text-xs">
								{proj.active ? m.common_active() : m.common_inactive()} &middot; {new Date(
									proj.createdAt
								).toLocaleDateString()}
							</p>
						</Card.Content>
					</Card.Root>
				</div>

				<!-- Execution breakdown bar inside stats_summary -->
				{#if stats.execCounts.total > 0}
					<Card.Root class="mt-4">
						<Card.Header>
							<Card.Title class="text-sm font-medium">{m.dashboard_exec_summary()}</Card.Title>
						</Card.Header>
						<Card.Content>
							<div class="space-y-2">
								<div class="bg-secondary flex h-3 overflow-hidden rounded-full">
									{#if stats.execCounts.pass > 0}
										<div
											class="bg-green-500 transition-all"
											style="width: {(stats.execCounts.pass / stats.execCounts.total) * 100}%"
										></div>
									{/if}
									{#if stats.execCounts.fail > 0}
										<div
											class="bg-red-500 transition-all"
											style="width: {(stats.execCounts.fail / stats.execCounts.total) * 100}%"
										></div>
									{/if}
									{#if stats.execCounts.blocked > 0}
										<div
											class="bg-orange-500 transition-all"
											style="width: {(stats.execCounts.blocked / stats.execCounts.total) * 100}%"
										></div>
									{/if}
									{#if stats.execCounts.skipped > 0}
										<div
											class="bg-gray-400 transition-all"
											style="width: {(stats.execCounts.skipped / stats.execCounts.total) * 100}%"
										></div>
									{/if}
								</div>
								<div class="flex flex-wrap gap-4 text-sm">
									<span class="flex items-center gap-1">
										<span class="inline-block h-3 w-3 rounded-full bg-green-500"></span>
										{m.dashboard_pass()}: {stats.execCounts.pass}
									</span>
									<span class="flex items-center gap-1">
										<span class="inline-block h-3 w-3 rounded-full bg-red-500"></span>
										{m.dashboard_fail()}: {stats.execCounts.fail}
									</span>
									<span class="flex items-center gap-1">
										<span class="inline-block h-3 w-3 rounded-full bg-orange-500"></span>
										{m.dashboard_blocked()}: {stats.execCounts.blocked}
									</span>
									<span class="flex items-center gap-1">
										<span class="inline-block h-3 w-3 rounded-full bg-gray-400"></span>
										{m.dashboard_skipped()}: {stats.execCounts.skipped}
									</span>
									<span class="flex items-center gap-1">
										<span class="bg-secondary inline-block h-3 w-3 rounded-full border"></span>
										{m.dashboard_pending()}: {stats.execCounts.pending}
									</span>
								</div>
							</div>
						</Card.Content>
					</Card.Root>
				{/if}

			<!-- pass_rate_trend -->
			{:else if widget.id === 'pass_rate_trend'}
				<Card.Root class="h-full">
					<Card.Header>
						<Card.Title class="text-sm font-medium">{m.dashboard_pass_rate_trend()}</Card.Title>
					</Card.Header>
					<Card.Content>
						{#if trendRuns.length > 0}
							<Chart config={trendConfig} aria-label="Pass rate trend chart" />
						{:else}
							<p class="text-muted-foreground text-sm text-center py-8">{m.dashboard_no_chart_data()}</p>
						{/if}
					</Card.Content>
				</Card.Root>

			<!-- status_distribution -->
			{:else if widget.id === 'status_distribution'}
				<Card.Root class="h-full">
					<Card.Header>
						<Card.Title class="text-sm font-medium">{m.dashboard_exec_chart()}</Card.Title>
					</Card.Header>
					<Card.Content class="flex justify-center">
						{#if stats.execCounts.total > 0}
							<div class="w-64">
								<LazyChart
									config={doughnutConfig}
									aria-label="Execution status distribution chart"
									height="h-64"
								/>
							</div>
						{:else}
							<p class="text-muted-foreground text-sm text-center py-8">{m.dashboard_no_chart_data()}</p>
						{/if}
					</Card.Content>
				</Card.Root>

			<!-- recent_runs -->
			{:else if widget.id === 'recent_runs'}
				{#if recentRuns.length > 0}
					<Card.Root class="h-full">
						<Card.Header>
							<div class="flex items-center justify-between">
								<Card.Title class="text-sm font-medium">{m.dashboard_recent_runs()}</Card.Title>
								<a
									href="/projects/{proj.id}/test-runs"
									class="text-muted-foreground hover:text-foreground text-xs"
								>
									{m.dashboard_view_all()} &rarr;
								</a>
							</div>
						</Card.Header>
						<Card.Content class="p-0">
							<Table.Root>
								<Table.Header>
									<Table.Row>
										<Table.Head>{m.common_name()}</Table.Head>
										<Table.Head class="w-24 hidden sm:table-cell">{m.dashboard_env()}</Table.Head>
										<Table.Head class="w-28">{m.common_status()}</Table.Head>
										<Table.Head class="w-40 hidden md:table-cell">{m.dashboard_result()}</Table.Head>
										<Table.Head class="w-28 hidden lg:table-cell">{m.common_date()}</Table.Head>
									</Table.Row>
								</Table.Header>
								<Table.Body>
									{#each recentRuns as run (run.id)}
										{@const runPassRate =
											run.totalCount > 0
												? Math.round((run.passCount / run.totalCount) * 100)
												: 0}
										<Table.Row
											class="cursor-pointer"
											onclick={() => {
												window.location.href = `/projects/${proj.id}/test-runs/${run.id}`;
											}}
										>
											<Table.Cell class="font-medium">{run.name}</Table.Cell>
											<Table.Cell class="hidden sm:table-cell">
												<Badge variant="outline">{run.environment}</Badge>
											</Table.Cell>
											<Table.Cell>
												<Badge variant={statusVariant(run.status)}>
													{run.status.replace('_', ' ')}
												</Badge>
											</Table.Cell>
											<Table.Cell class="hidden md:table-cell">
												<div class="flex items-center gap-2">
													<div
														class="bg-secondary flex h-2 w-20 overflow-hidden rounded-full"
														title="{m.dashboard_pass()}: {run.passCount}, {m.dashboard_fail()}: {run.failCount}"
													>
														{#if run.passCount > 0}
															<div
																class="bg-green-500"
																style="width: {(run.passCount / run.totalCount) * 100}%"
															></div>
														{/if}
														{#if run.failCount > 0}
															<div
																class="bg-red-500"
																style="width: {(run.failCount / run.totalCount) * 100}%"
															></div>
														{/if}
													</div>
													<span class="text-muted-foreground text-xs"
														>{runPassRate}% ({run.passCount}P / {run.failCount}F)</span
													>
												</div>
											</Table.Cell>
											<Table.Cell class="text-muted-foreground text-xs hidden lg:table-cell">
												{new Date(run.createdAt).toLocaleDateString()}
											</Table.Cell>
										</Table.Row>
									{/each}
								</Table.Body>
							</Table.Root>
						</Card.Content>
					</Card.Root>
				{/if}

			<!-- priority_breakdown -->
			{:else if widget.id === 'priority_breakdown'}
				<Card.Root class="h-full">
					<Card.Header>
						<Card.Title class="text-sm font-medium">Priority Breakdown</Card.Title>
					</Card.Header>
					<Card.Content>
						<div class="space-y-2 text-sm">
							{#each ([['CRITICAL', 'bg-red-500'], ['HIGH', 'bg-orange-500'], ['MEDIUM', 'bg-yellow-500'], ['LOW', 'bg-blue-400']] as const) as [label, color] (label)}
								<div class="flex items-center gap-2">
									<span class="inline-block h-2.5 w-2.5 shrink-0 rounded-full {color}"></span>
									<span class="text-muted-foreground flex-1">{label}</span>
								</div>
							{/each}
							<p class="text-muted-foreground pt-1 text-xs">
								Detailed priority data available in test cases view.
							</p>
						</div>
					</Card.Content>
				</Card.Root>

			<!-- top_failing -->
			{:else if widget.id === 'top_failing'}
				<Card.Root class="h-full">
					<Card.Header>
						<Card.Title class="text-sm font-medium">Top Failing</Card.Title>
					</Card.Header>
					<Card.Content>
						{#if activityLog.filter((a) => a.status === 'FAIL').length > 0}
							<ul class="space-y-1.5 text-sm">
								{#each activityLog.filter((a) => a.status === 'FAIL').slice(0, 5) as activity (activity.id)}
									<li class="flex items-center gap-2">
										<span class="inline-block h-2 w-2 shrink-0 rounded-full bg-red-500"></span>
										<span class="text-muted-foreground min-w-0 flex-1 truncate">
											{activity.testRunName}
										</span>
										<span class="text-muted-foreground shrink-0 text-xs">
											{activity.executedAt ? timeAgo(activity.executedAt) : ''}
										</span>
									</li>
								{/each}
							</ul>
						{:else}
							<p class="text-muted-foreground text-sm">No recent failures.</p>
						{/if}
					</Card.Content>
				</Card.Root>
			{/if}
		</div>
	{/each}
</div>

<!-- ── Description (always shown) ────────────────────── -->
{#if proj.description}
	<Card.Root class="mt-4">
		<Card.Header>
			<Card.Title class="text-sm font-medium">{m.common_description()}</Card.Title>
		</Card.Header>
		<Card.Content>
			<p class="text-muted-foreground whitespace-pre-wrap">{proj.description}</p>
		</Card.Content>
	</Card.Root>
{/if}

<!-- Activity log (always shown below grid, not a customizable widget) -->
{#if activityLog.length > 0}
	<Card.Root class="mt-4">
		<Card.Header>
			<Card.Title class="text-sm font-medium">{m.dashboard_activity()}</Card.Title>
		</Card.Header>
		<Card.Content>
			<div class="space-y-2">
				{#each visibleActivities as activity (activity.id)}
					<div class="flex items-center gap-3 text-sm">
						<span
							class="inline-block h-2 w-2 rounded-full {activity.status === 'PASS'
								? 'bg-green-500'
								: activity.status === 'FAIL'
									? 'bg-red-500'
									: activity.status === 'BLOCKED'
										? 'bg-orange-500'
										: 'bg-gray-400'}"
						></span>
						<span class="font-medium {statusColor(activity.status)}">{activity.status}</span>
						<span class="text-muted-foreground">
							{activity.executedBy ?? '?'} &middot; {activity.testRunName}
						</span>
						<span class="text-muted-foreground ml-auto text-xs">
							{activity.executedAt ? timeAgo(activity.executedAt) : ''}
						</span>
					</div>
				{/each}
			</div>
			{#if activityLog.length > ACTIVITY_LIMIT && !showAllActivity}
				<button
					type="button"
					class="mt-3 w-full text-center text-xs text-primary hover:underline"
					onclick={() => { showAllActivity = true; }}
				>
					{m.dashboard_activity_show_more()} ({activityLog.length - ACTIVITY_LIMIT})
				</button>
			{/if}
		</Card.Content>
	</Card.Root>
{/if}
