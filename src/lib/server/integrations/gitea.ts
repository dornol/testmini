import type {
	IssueTrackerConfig,
	CreateIssueResult,
	IssueStatusResult,
	IssueDetail
} from './types';
import { safeIntegrationFetch } from './safe-fetch';
import {
	asArray,
	asRecord,
	normalizeIssueColor,
	nullableStringField,
	optionalStringField,
	stringField
} from './external-response';
import { issueStatusCategoryFromState, parseExternalIssueState } from './issue-status';

export async function testGiteaConnection(
	config: IssueTrackerConfig
): Promise<{ ok: boolean; message: string }> {
	if (!config.apiToken) return { ok: false, message: 'API token is required for Gitea' };
	if (!config.projectKey)
		return { ok: false, message: 'Repository (owner/repo) is required for Gitea' };

	const url = `${config.baseUrl}/api/v1/repos/${config.projectKey}`;
	const res = await safeIntegrationFetch(url, {
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
	const res = await safeIntegrationFetch(url, {
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
	await safeIntegrationFetch(url, {
		method: 'POST',
		headers: {
			Authorization: `token ${config.apiToken}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({ body: comment })
	});
}

export async function fetchGiteaIssueDetail(
	config: IssueTrackerConfig,
	externalUrl: string
): Promise<IssueDetail | null> {
	if (!config.apiToken || !config.projectKey) return null;

	const match = externalUrl.match(/\/issues\/(\d+)/);
	if (!match) return null;

	const issueNumber = match[1];
	const headers = {
		Authorization: `token ${config.apiToken}`,
		Accept: 'application/json'
	};

	const [issueRes, commentsRes] = await Promise.all([
		safeIntegrationFetch(
			`${config.baseUrl}/api/v1/repos/${config.projectKey}/issues/${issueNumber}`,
			{ headers }
		),
		safeIntegrationFetch(
			`${config.baseUrl}/api/v1/repos/${config.projectKey}/issues/${issueNumber}/comments?limit=50`,
			{ headers }
		)
	]);

	if (!issueRes.ok) throw new Error(`Gitea returned ${issueRes.status}`);

	const issue = asRecord(await issueRes.json());
	const comments = asArray(commentsRes.ok ? await commentsRes.json() : []);
	const state = parseExternalIssueState(issue);

	return {
		title: stringField(issue.title),
		body: stringField(issue.body),
		state,
		stateCategory: issueStatusCategoryFromState(state),
		author: stringField(asRecord(issue.user).login) || stringField(asRecord(issue.user).full_name),
		authorAvatar: optionalStringField(asRecord(issue.user).avatar_url),
		labels: asArray(issue.labels).flatMap((label) => {
			const record = asRecord(label);
			const name = stringField(record.name);
			if (!name) return [];
			return [{ name, color: normalizeIssueColor(record.color) }];
		}),
		createdAt: stringField(issue.created_at),
		updatedAt: stringField(issue.updated_at),
		closedAt: nullableStringField(issue.closed_at),
		comments: comments.flatMap((comment) => {
			const record = asRecord(comment);
			if (typeof record.id !== 'number') return [];
			const user = asRecord(record.user);
			return [
				{
					id: record.id,
					body: stringField(record.body),
					author: stringField(user.login) || stringField(user.full_name),
					authorAvatar: optionalStringField(user.avatar_url),
					createdAt: stringField(record.created_at)
				}
			];
		})
	};
}

export async function updateGiteaIssueState(
	config: IssueTrackerConfig,
	externalUrl: string,
	state: 'open' | 'closed'
): Promise<void> {
	if (!config.apiToken || !config.projectKey) return;

	const match = externalUrl.match(/\/issues\/(\d+)/);
	if (!match) return;

	const issueNumber = match[1];
	const res = await safeIntegrationFetch(
		`${config.baseUrl}/api/v1/repos/${config.projectKey}/issues/${issueNumber}`,
		{
			method: 'PATCH',
			headers: {
				Authorization: `token ${config.apiToken}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ state })
		}
	);

	if (!res.ok) {
		throw new Error(`Gitea returned ${res.status}: ${await res.text()}`);
	}
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
	const res = await safeIntegrationFetch(url, {
		headers: {
			Authorization: `token ${config.apiToken}`,
			Accept: 'application/json'
		}
	});

	if (!res.ok) {
		throw new Error(`Gitea returned ${res.status}: ${await res.text()}`);
	}

	const data = await res.json();
	const state = parseExternalIssueState(data);
	const statusCategory = issueStatusCategoryFromState(state);

	return { status: state, statusCategory };
}
