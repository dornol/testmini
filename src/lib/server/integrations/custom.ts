import type { IssueTrackerConfig, CreateIssueResult } from './types';

export async function createCustomIssue(
	config: IssueTrackerConfig,
	title: string,
	description: string,
	backlink?: string
): Promise<CreateIssueResult> {
	const template = config.customTemplate as {
		titleTemplate?: string;
		bodyTemplate?: string;
		method?: string;
		headers?: Record<string, string>;
	} | null;

	if (!template) throw new Error('Custom template is required for CUSTOM provider');

	const method = template.method || 'POST';
	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
		...(template.headers || {})
	};

	if (config.apiToken) {
		headers['Authorization'] = `Bearer ${config.apiToken}`;
	}

	let desc = description;
	if (backlink) {
		desc += `\n\n---\nLinked from testmini: ${backlink}`;
	}

	const body = JSON.stringify({ title, description: desc });

	const res = await fetch(config.baseUrl, {
		method,
		headers,
		body
	});

	if (!res.ok) {
		throw new Error(`Custom provider returned ${res.status}: ${await res.text()}`);
	}

	const data = await res.json();
	return {
		url: data.url || config.baseUrl,
		key: data.key || data.id?.toString() || '',
		title
	};
}
