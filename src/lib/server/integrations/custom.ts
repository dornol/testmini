import type { IssueTrackerConfig, CreateIssueResult } from './types';
import { safeIntegrationFetch } from './safe-fetch';
import { validateCustomIssueTemplate } from './custom-template';

export async function createCustomIssue(
	config: IssueTrackerConfig,
	title: string,
	description: string,
	backlink?: string
): Promise<CreateIssueResult> {
	if (!config.customTemplate) throw new Error('Custom template is required for CUSTOM provider');
	const validation = validateCustomIssueTemplate(config.customTemplate);
	if (!validation.ok) throw new Error(validation.error);
	const template = validation.template;

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

	const res = await safeIntegrationFetch(config.baseUrl, {
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
