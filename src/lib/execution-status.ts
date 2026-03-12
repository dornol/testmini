/**
 * Shared execution status color utilities.
 * All variants use orange for BLOCKED (not yellow).
 */

/** Text-only status color (dashboard, filter bar, run summary) */
export function statusColorText(status: string | null): string {
	switch (status) {
		case 'PASS':
			return 'text-green-600 dark:text-green-400';
		case 'FAIL':
			return 'text-red-600 dark:text-red-400';
		case 'BLOCKED':
			return 'text-orange-600 dark:text-orange-400';
		case 'SKIPPED':
			return 'text-gray-500';
		case 'PENDING':
			return 'text-muted-foreground';
		default:
			return 'text-muted-foreground';
	}
}

/** Text + background status color (execution table, execution row) */
export function statusColorBg(status: string): string {
	switch (status) {
		case 'PASS':
			return 'text-green-600 bg-green-50 dark:bg-green-950 dark:text-green-400';
		case 'FAIL':
			return 'text-red-600 bg-red-50 dark:bg-red-950 dark:text-red-400';
		case 'BLOCKED':
			return 'text-orange-600 bg-orange-50 dark:bg-orange-950 dark:text-orange-400';
		case 'SKIPPED':
			return 'text-gray-600 bg-gray-50 dark:bg-gray-800 dark:text-gray-400';
		default:
			return 'text-muted-foreground';
	}
}

/** Badge-style status color (traceability matrix) */
export function statusColorBadge(status: string | null): string {
	switch (status) {
		case 'PASS':
			return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
		case 'FAIL':
			return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
		case 'BLOCKED':
			return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
		case 'SKIPPED':
			return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
		case 'PENDING':
			return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
		default:
			return 'bg-muted text-muted-foreground';
	}
}
