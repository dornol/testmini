import type { IssueTrackerConfig, CreateIssueResult, IssueStatusResult } from './types';

function jiraAuthHeader(config: IssueTrackerConfig): string {
	if (!config.apiToken) throw new Error('API token is required for Jira');
	// apiToken stored as "email:token" for Jira Basic auth
	const token = config.apiToken.includes(':')
		? config.apiToken
		: `user@example.com:${config.apiToken}`;
	return `Basic ${btoa(token)}`;
}

export async function testJiraConnection(config: IssueTrackerConfig): Promise<{ ok: boolean; message: string }> {
	if (!config.apiToken) return { ok: false, message: 'API token is required for Jira' };

	const url = `${config.baseUrl}/rest/api/3/myself`;
	const res = await fetch(url, {
		headers: {
			Authorization: jiraAuthHeader(config),
			Accept: 'application/json'
		}
	});

	if (!res.ok) {
		return { ok: false, message: `Jira returned ${res.status}: ${await res.text()}` };
	}

	const data = await res.json();
	return { ok: true, message: `Connected as ${data.displayName || data.emailAddress || 'unknown'}` };
}

export async function createJiraIssue(
	config: IssueTrackerConfig,
	title: string,
	description: string,
	backlink?: string
): Promise<CreateIssueResult> {
	if (!config.projectKey) throw new Error('Project key is required for Jira');

	const descContent: unknown[] = [
		{ type: 'paragraph', content: [{ type: 'text', text: description }] }
	];
	if (backlink) {
		descContent.push({
			type: 'paragraph',
			content: [
				{ type: 'text', text: 'Linked from testmini: ' },
				{
					type: 'text',
					text: backlink,
					marks: [{ type: 'link', attrs: { href: backlink } }]
				}
			]
		});
	}

	const url = `${config.baseUrl}/rest/api/3/issue`;
	const res = await fetch(url, {
		method: 'POST',
		headers: {
			Authorization: jiraAuthHeader(config),
			'Content-Type': 'application/json',
			Accept: 'application/json'
		},
		body: JSON.stringify({
			fields: {
				project: { key: config.projectKey },
				summary: title,
				description: {
					type: 'doc',
					version: 1,
					content: descContent
				},
				issuetype: { name: 'Bug' }
			}
		})
	});

	if (!res.ok) {
		throw new Error(`Jira returned ${res.status}: ${await res.text()}`);
	}

	const data = await res.json();
	return {
		url: `${config.baseUrl}/browse/${data.key}`,
		key: data.key,
		title
	};
}

export async function fetchJiraIssueStatus(
	config: IssueTrackerConfig,
	externalKey: string | null
): Promise<IssueStatusResult> {
	if (!externalKey) return { status: 'unknown', statusCategory: 'unknown' };

	const url = `${config.baseUrl}/rest/api/3/issue/${encodeURIComponent(externalKey)}?fields=status`;
	const res = await fetch(url, {
		headers: {
			Authorization: jiraAuthHeader(config),
			Accept: 'application/json'
		}
	});

	if (!res.ok) {
		throw new Error(`Jira returned ${res.status}: ${await res.text()}`);
	}

	const data = await res.json();
	const statusName = data.fields?.status?.name ?? 'unknown';
	const categoryKey = data.fields?.status?.statusCategory?.key ?? '';

	let statusCategory: IssueStatusResult['statusCategory'] = 'unknown';
	if (categoryKey === 'new') statusCategory = 'open';
	else if (categoryKey === 'indeterminate') statusCategory = 'in_progress';
	else if (categoryKey === 'done') statusCategory = 'done';

	return { status: statusName, statusCategory };
}
