/** Format a duration in milliseconds to a human-readable string (e.g., "3m 12s") */
export function formatDuration(ms: number): string {
	if (ms < 1000) return `${ms}ms`;
	const seconds = Math.floor(ms / 1000);
	if (seconds < 60) return `${(ms / 1000).toFixed(1)}s`;
	const minutes = Math.floor(seconds / 60);
	const remainSec = seconds % 60;
	if (minutes < 60) return `${minutes}m ${remainSec}s`;
	const hours = Math.floor(minutes / 60);
	const remainMin = minutes % 60;
	return `${hours}h ${remainMin}m`;
}

/** Format duration from two dates. Returns null if either date is missing. */
export function formatDurationFromDates(
	startedAt: string | Date | null,
	completedAt: string | Date | null
): string | null {
	if (!startedAt || !completedAt) return null;
	const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
	if (ms < 0) return null;
	return formatDuration(ms);
}
