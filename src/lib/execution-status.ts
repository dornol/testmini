import * as m from '$lib/paraglide/messages.js';

/**
 * Shared execution status color utilities.
 * All variants use orange for BLOCKED (not yellow).
 */

/** Text-only status color (dashboard, filter bar, run summary) */
export function statusColorText(status: string | null): string {
	switch (status) {
		case 'PASS':
			return 'text-green-700 dark:text-green-400';
		case 'FAIL':
			return 'text-red-700 dark:text-red-400';
		case 'BLOCKED':
			return 'text-orange-700 dark:text-orange-400';
		case 'SKIPPED':
			return 'text-gray-600 dark:text-gray-400';
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
			return 'text-green-700 bg-green-50 dark:bg-green-950 dark:text-green-400';
		case 'FAIL':
			return 'text-red-700 bg-red-50 dark:bg-red-950 dark:text-red-400';
		case 'BLOCKED':
			return 'text-orange-700 bg-orange-50 dark:bg-orange-950 dark:text-orange-400';
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

/** Localized label for an execution result; an unknown value is shown as it is. */
export function executionStatusLabel(status: string | null): string {
	switch (status) {
		case 'PASS':
			return m.dashboard_pass();
		case 'FAIL':
			return m.dashboard_fail();
		case 'BLOCKED':
			return m.dashboard_blocked();
		case 'SKIPPED':
			return m.dashboard_skipped();
		case 'PENDING':
			return m.dashboard_pending();
		default:
			return status ?? '';
	}
}

/** Localized label for a test run's state; an unknown value is shown as it is. */
export function planStatusLabel(status: string): string {
	switch (status) {
		case 'DRAFT':
			return m.tp_status_draft();
		case 'IN_REVIEW':
			return m.tp_status_in_review();
		case 'APPROVED':
			return m.tp_status_approved();
		case 'ACTIVE':
			return m.tp_status_active();
		case 'COMPLETED':
			return m.tp_status_completed();
		case 'ARCHIVED':
			return m.tp_status_archived();
		default:
			return status.replace('_', ' ');
	}
}

export function approvalStatusLabel(status: string): string {
	switch (status) {
		case 'DRAFT':
			return m.approval_draft();
		case 'IN_REVIEW':
			return m.approval_in_review();
		case 'APPROVED':
			return m.approval_approved();
		case 'REJECTED':
			return m.approval_rejected();
		default:
			return status.replace('_', ' ');
	}
}

export function runStatusLabel(status: string): string {
	switch (status) {
		case 'CREATED':
			return m.run_status_created();
		case 'IN_PROGRESS':
			return m.cycle_in_progress();
		case 'COMPLETED':
			return m.cycle_completed();
		default:
			return status.replace('_', ' ');
	}
}
