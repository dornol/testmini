/**
 * Utility functions for navigation context and state persistence.
 */

const COLLAPSED_GROUPS_PREFIX = 'tc-collapsed-';

/**
 * Loads collapsed group IDs from localStorage for a given project.
 */
export function loadCollapsedGroups(projectId: number): Set<number> {
	try {
		const stored = localStorage.getItem(`${COLLAPSED_GROUPS_PREFIX}${projectId}`);
		if (stored) {
			const parsed = JSON.parse(stored);
			if (Array.isArray(parsed)) return new Set(parsed.filter((v): v is number => typeof v === 'number'));
		}
	} catch { /* ignore corrupt data */ }
	return new Set();
}

/**
 * Saves collapsed group IDs to localStorage for a given project.
 */
export function saveCollapsedGroups(projectId: number, groups: Set<number>): void {
	try {
		localStorage.setItem(`${COLLAPSED_GROUPS_PREFIX}${projectId}`, JSON.stringify([...groups]));
	} catch { /* ignore storage errors */ }
}

/**
 * Validates a date range. Returns true if the range is valid (from <= to).
 * Empty values are always valid.
 */
export function isDateRangeValid(from: string, to: string): boolean {
	if (!from || !to) return true;
	return from <= to;
}
