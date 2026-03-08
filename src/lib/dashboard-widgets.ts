import type { WidgetConfig } from '$lib/server/db/schema';

export interface WidgetMeta {
	id: string;
	label: string;
	description: string;
	defaultSize: WidgetConfig['size'];
}

export const WIDGET_DEFINITIONS: WidgetMeta[] = [
	{
		id: 'stats_summary',
		label: 'Stats Summary',
		description: 'Overall stats cards (total TC, runs, pass rate)',
		defaultSize: 'lg'
	},
	{
		id: 'pass_rate_trend',
		label: 'Pass Rate Trend',
		description: 'Pass rate trend line chart',
		defaultSize: 'md'
	},
	{
		id: 'status_distribution',
		label: 'Status Distribution',
		description: 'Execution status doughnut chart',
		defaultSize: 'md'
	},
	{
		id: 'recent_runs',
		label: 'Recent Runs',
		description: 'Recent test runs table',
		defaultSize: 'lg'
	},
	{
		id: 'priority_breakdown',
		label: 'Priority Breakdown',
		description: 'Priority breakdown bar chart',
		defaultSize: 'sm'
	},
	{
		id: 'top_failing',
		label: 'Top Failing',
		description: 'Top failing test cases',
		defaultSize: 'md'
	}
];

export const DEFAULT_LAYOUT: WidgetConfig[] = WIDGET_DEFINITIONS.map((w, i) => ({
	id: w.id,
	visible: true,
	order: i,
	size: w.defaultSize
}));

export const SIZE_COLS: Record<WidgetConfig['size'], string> = {
	sm: 'col-span-1',
	md: 'col-span-1 md:col-span-2',
	lg: 'col-span-1 md:col-span-2 lg:col-span-3'
};
