import * as m from '$lib/paraglide/messages.js';

/** Map Superforms paths to actual controls, including nested step fields. */
export function testCaseFieldTarget(path: string): string | undefined {
	const step = /^steps\[(\d+)\]\.(action|expected)$/.exec(path);
	if (step) return `step-${step[2]}-${step[1]}`;
	if (/^(title|priority|precondition|expectedResult|automationKey)$/.test(path)) return path;
	return undefined;
}

/** Localize validation presentation without changing the server/API schema contract. */
export function localizeTestCaseErrors(errors: { path: string; messages: string[] }[]) {
	return errors.map((error) => ({
		...error,
		messages: error.messages.map((message) => {
			if (message === 'Title is required') return m.ui_title_required();
			if (message === 'Action is required') return m.ui_action_required();
			if (message === 'Automation key is already in use') return m.ui_automation_key_exists();
			if (error.path === 'title' && /200/.test(message)) return m.ui_max_characters({ count: 200 });
			if (['precondition', 'expectedResult'].includes(error.path) && /2000/.test(message))
				return m.ui_max_characters({ count: 2000 });
			if (error.path === 'automationKey' && /200/.test(message))
				return m.ui_max_characters({ count: 200 });
			return message;
		})
	}));
}

export function testCaseErrorMessage(path: string, messages?: string[]) {
	return localizeTestCaseErrors([{ path, messages: messages ?? [] }])[0].messages.join(' ');
}
