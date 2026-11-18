import type { ZodIssue } from 'zod';
import * as m from '$lib/paraglide/messages.js';

export type FormFeedback = { path: string; messages: string[] };

/** Present schema failures as actionable UI feedback without changing API error contracts. */
export function workflowFormFeedback(issues: ZodIssue[]): FormFeedback[] {
	const grouped = new Map<string, string[]>();
	for (const issue of issues) {
		const path = String(issue.path[0] ?? '_form');
		let text = m.ui_invalid_value();
		if (issue.code === 'too_big') {
			text =
				path === 'environments' && issue.origin === 'array'
					? m.ui_environment_selection_limit({ count: Number(issue.maximum) })
					: path === 'testCaseIds'
						? m.ui_case_selection_limit({ count: Number(issue.maximum) })
						: m.ui_max_characters({ count: Number(issue.maximum) });
		} else if (issue.code === 'too_small' || issue.code === 'invalid_type') {
			if (path === 'name') text = m.ui_name_required();
			if (path === 'environment') text = m.ui_environment_required();
			if (path === 'environments') text = m.ui_cross_environment_required();
			if (path === 'testCaseIds') text = m.ui_case_selection_required();
		} else if (path === 'endDate' && issue.code === 'custom') {
			text = m.ui_end_date_after_start();
		}
		const messages = grouped.get(path) ?? [];
		if (!messages.includes(text)) messages.push(text);
		grouped.set(path, messages);
	}
	return [...grouped].map(([path, messages]) => ({ path, messages }));
}

export function feedbackFor(errors: FormFeedback[], path: string): string {
	return errors.find((error) => error.path === path)?.messages.join(' ') ?? '';
}
