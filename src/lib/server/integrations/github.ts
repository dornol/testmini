import type { IssueTrackerConfig, CreateIssueResult, IssueStatusResult } from './types';

export async function testGithubConnection(config: IssueTrackerConfig): Promise<{ ok: boolean; message: string }> {
	if (!config.apiToken) return { ok: false, message: 'API token is required for GitHub' };
	if (!config.projectKey) return { ok: false, message: 'Repository (owner/repo) is required for GitHub' };

	const url = `https://api.github.com/repos/${config.projectKey}`;
	const res = await fetch(url, {
		headers: {
			Authorization: `Bearer ${config.apiToken}`,
			Accept: 'application/vnd.github+json'
		}
	});

	if (!res.ok) {
		return { ok: false, message: `GitHub returned ${res.status}: ${await res.text()}` };
	}

	const data = await res.json();
	return { ok: true, message: `Connected to ${data.full_name}` };
}

export async function createGithubIssue(
	config: IssueTrackerConfig,
	title: string,
	description: string,
	backlink?: string
): Promise<CreateIssueResult> {
	if (!config.apiToken) throw new Error('API token is required for GitHub');
	if (!config.projectKey) throw new Error('Repository (owner/repo) is required for GitHub');

	let body = description;
	if (backlink) {
		body += `\n\n---\n🔗 [View in testmini](${backlink})`;
	}

	const url = `https://api.github.com/repos/${config.projectKey}/issues`;
	const res = await fetch(url, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${config.apiToken}`,
			'Content-Type': 'application/json',
			Accept: 'application/vnd.github+json'
		},
		body: JSON.stringify({ title, body })
	});

	if (!res.ok) {
		throw new Error(`GitHub returned ${res.status}: ${await res.text()}`);
	}

	const data = await res.json();
	return {
		url: data.html_url,
		key: `#${data.number}`,
		title
	};
}

export async function fetchGithubIssueStatus(
	config: IssueTrackerConfig,
	externalUrl: string
): Promise<IssueStatusResult> {
	if (!config.apiToken) throw new Error('API token is required for GitHub');
	if (!config.projectKey) throw new Error('Repository (owner/repo) is required for GitHub');

	const match = externalUrl.match(/github\.com\/[^/]+\/[^/]+\/issues\/(\d+)/);
	if (!match) return { status: 'unknown', statusCategory: 'unknown' };

	const issueNumber = match[1];
	const url = `https://api.github.com/repos/${config.projectKey}/issues/${issueNumber}`;
	const res = await fetch(url, {
		headers: {
			Authorization: `Bearer ${config.apiToken}`,
			Accept: 'application/vnd.github+json'
		}
	});

	if (!res.ok) {
		throw new Error(`GitHub returned ${res.status}: ${await res.text()}`);
	}

	const data = await res.json();
	const state = data.state as string;
	const statusCategory: IssueStatusResult['statusCategory'] = state === 'closed' ? 'done' : 'open';

	return { status: state, statusCategory };
}
