import type { IssueTrackerConfig, CreateIssueResult, IssueStatusResult } from './types';

export async function testGiteaConnection(config: IssueTrackerConfig): Promise<{ ok: boolean; message: string }> {
	if (!config.apiToken) return { ok: false, message: 'API token is required for Gitea' };
	if (!config.projectKey) return { ok: false, message: 'Repository (owner/repo) is required for Gitea' };

	const url = `${config.baseUrl}/api/v1/repos/${config.projectKey}`;
	const res = await fetch(url, {
		headers: {
			Authorization: `token ${config.apiToken}`,
			Accept: 'application/json'
		}
	});

	if (!res.ok) {
		return { ok: false, message: `Gitea returned ${res.status}: ${await res.text()}` };
	}

	const data = await res.json();
	return { ok: true, message: `Connected to ${data.full_name || data.name}` };
}

export async function createGiteaIssue(
	config: IssueTrackerConfig,
	title: string,
	description: string,
	backlink?: string
): Promise<CreateIssueResult> {
	if (!config.apiToken) throw new Error('API token is required for Gitea');
	if (!config.projectKey) throw new Error('Repository (owner/repo) is required for Gitea');

	let body = description;
	if (backlink) {
		body += `\n\n---\n🔗 [View in testmini](${backlink})`;
	}

	const url = `${config.baseUrl}/api/v1/repos/${config.projectKey}/issues`;
	const res = await fetch(url, {
		method: 'POST',
		headers: {
			Authorization: `token ${config.apiToken}`,
			'Content-Type': 'application/json',
			Accept: 'application/json'
		},
		body: JSON.stringify({ title, body })
	});

	if (!res.ok) {
		throw new Error(`Gitea returned ${res.status}: ${await res.text()}`);
	}

	const data = await res.json();
	return {
		url: data.html_url,
		key: `#${data.number}`,
		title
	};
}

export async function addGiteaIssueComment(
	config: IssueTrackerConfig,
	externalUrl: string,
	comment: string
): Promise<void> {
	if (!config.apiToken || !config.projectKey) return;

	const match = externalUrl.match(/\/issues\/(\d+)/);
	if (!match) return;

	const issueNumber = match[1];
	const url = `${config.baseUrl}/api/v1/repos/${config.projectKey}/issues/${issueNumber}/comments`;
	await fetch(url, {
		method: 'POST',
		headers: {
			Authorization: `token ${config.apiToken}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({ body: comment })
	});
}

export async function fetchGiteaIssueStatus(
	config: IssueTrackerConfig,
	externalUrl: string
): Promise<IssueStatusResult> {
	if (!config.apiToken) throw new Error('API token is required for Gitea');
	if (!config.projectKey) throw new Error('Repository (owner/repo) is required for Gitea');

	const match = externalUrl.match(/\/issues\/(\d+)/);
	if (!match) return { status: 'unknown', statusCategory: 'unknown' };

	const issueNumber = match[1];
	const url = `${config.baseUrl}/api/v1/repos/${config.projectKey}/issues/${issueNumber}`;
	const res = await fetch(url, {
		headers: {
			Authorization: `token ${config.apiToken}`,
			Accept: 'application/json'
		}
	});

	if (!res.ok) {
		throw new Error(`Gitea returned ${res.status}: ${await res.text()}`);
	}

	const data = await res.json();
	const state = data.state as string;
	const statusCategory: IssueStatusResult['statusCategory'] = state === 'closed' ? 'done' : 'open';

	return { status: state, statusCategory };
}
