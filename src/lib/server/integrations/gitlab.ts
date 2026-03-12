import type { IssueTrackerConfig, CreateIssueResult, IssueStatusResult } from './types';

export async function testGitlabConnection(config: IssueTrackerConfig): Promise<{ ok: boolean; message: string }> {
	if (!config.apiToken) return { ok: false, message: 'API token is required for GitLab' };
	if (!config.projectKey) return { ok: false, message: 'Project ID is required for GitLab' };

	const url = `${config.baseUrl}/api/v4/projects/${encodeURIComponent(config.projectKey)}`;
	const res = await fetch(url, {
		headers: {
			'PRIVATE-TOKEN': config.apiToken,
			Accept: 'application/json'
		}
	});

	if (!res.ok) {
		return { ok: false, message: `GitLab returned ${res.status}: ${await res.text()}` };
	}

	const data = await res.json();
	return { ok: true, message: `Connected to ${data.name_with_namespace || data.name}` };
}

export async function createGitlabIssue(
	config: IssueTrackerConfig,
	title: string,
	description: string,
	backlink?: string
): Promise<CreateIssueResult> {
	if (!config.apiToken) throw new Error('API token is required for GitLab');
	if (!config.projectKey) throw new Error('Project ID is required for GitLab');

	let desc = description;
	if (backlink) {
		desc += `\n\n---\n🔗 [View in testmini](${backlink})`;
	}

	const url = `${config.baseUrl}/api/v4/projects/${encodeURIComponent(config.projectKey)}/issues`;
	const res = await fetch(url, {
		method: 'POST',
		headers: {
			'PRIVATE-TOKEN': config.apiToken,
			'Content-Type': 'application/json',
			Accept: 'application/json'
		},
		body: JSON.stringify({ title, description: desc })
	});

	if (!res.ok) {
		throw new Error(`GitLab returned ${res.status}: ${await res.text()}`);
	}

	const data = await res.json();
	return {
		url: data.web_url,
		key: `#${data.iid}`,
		title
	};
}

export async function fetchGitlabIssueStatus(
	config: IssueTrackerConfig,
	externalUrl: string
): Promise<IssueStatusResult> {
	if (!config.apiToken) throw new Error('API token is required for GitLab');
	if (!config.projectKey) throw new Error('Project ID is required for GitLab');

	const match = externalUrl.match(/\/issues\/(\d+)/);
	if (!match) return { status: 'unknown', statusCategory: 'unknown' };

	const iid = match[1];
	const url = `${config.baseUrl}/api/v4/projects/${encodeURIComponent(config.projectKey)}/issues/${iid}`;
	const res = await fetch(url, {
		headers: {
			'PRIVATE-TOKEN': config.apiToken,
			Accept: 'application/json'
		}
	});

	if (!res.ok) {
		throw new Error(`GitLab returned ${res.status}: ${await res.text()}`);
	}

	const data = await res.json();
	const state = data.state as string;
	const statusCategory: IssueStatusResult['statusCategory'] = state === 'closed' ? 'done' : 'open';

	return { status: state, statusCategory };
}
