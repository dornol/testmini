import type { IssueStatusResult } from './types';

export function parseExternalIssueState(payload: unknown): string {
	if (payload === null || typeof payload !== 'object') return 'unknown';

	const state = (payload as { state?: unknown }).state;
	if (typeof state !== 'string') return 'unknown';

	const trimmed = state.trim();
	return trimmed || 'unknown';
}

export function issueStatusCategoryFromState(
	state: string
): IssueStatusResult['statusCategory'] {
	if (state === 'unknown') return 'unknown';
	if (state === 'closed') return 'done';
	return 'open';
}
