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

export async function testGithubConnection(
	config: IssueTrackerConfig
): Promise<{ ok: boolean; message: string }> {
	if (!config.apiToken) return { ok: false, message: 'API token is required for GitHub' };
	if (!config.projectKey)
		return { ok: false, message: 'Repository (owner/repo) is required for GitHub' };

	const url = `https://api.github.com/repos/${config.projectKey}`;
	const res = await safeIntegrationFetch(url, {
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
	const res = await safeIntegrationFetch(url, {
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

export async function addGithubIssueComment(
	config: IssueTrackerConfig,
	externalUrl: string,
	comment: string
): Promise<void> {
	if (!config.apiToken || !config.projectKey) return;

	const match = externalUrl.match(/\/issues\/(\d+)/);
	if (!match) return;

	const issueNumber = match[1];
	const url = `https://api.github.com/repos/${config.projectKey}/issues/${issueNumber}/comments`;
	await safeIntegrationFetch(url, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${config.apiToken}`,
			'Content-Type': 'application/json',
			Accept: 'application/vnd.github+json'
		},
		body: JSON.stringify({ body: comment })
	});
}

export async function fetchGithubIssueDetail(
	config: IssueTrackerConfig,
	externalUrl: string
): Promise<IssueDetail | null> {
	if (!config.apiToken || !config.projectKey) return null;

	const match = externalUrl.match(/github\.com\/[^/]+\/[^/]+\/issues\/(\d+)/);
	if (!match) return null;

	const issueNumber = match[1];
	const headers = {
		Authorization: `Bearer ${config.apiToken}`,
		Accept: 'application/vnd.github+json'
	};

	const [issueRes, commentsRes] = await Promise.all([
		safeIntegrationFetch(
			`https://api.github.com/repos/${config.projectKey}/issues/${issueNumber}`,
			{
				headers
			}
		),
		safeIntegrationFetch(
			`https://api.github.com/repos/${config.projectKey}/issues/${issueNumber}/comments?per_page=50`,
			{ headers }
		)
	]);

	if (!issueRes.ok) throw new Error(`GitHub returned ${issueRes.status}`);

	const issue = asRecord(await issueRes.json());
	const comments = asArray(commentsRes.ok ? await commentsRes.json() : []);
	const state = parseExternalIssueState(issue);

	return {
		title: stringField(issue.title),
		body: stringField(issue.body),
		state,
		stateCategory: issueStatusCategoryFromState(state),
		author: stringField(asRecord(issue.user).login),
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
					author: stringField(user.login),
					authorAvatar: optionalStringField(user.avatar_url),
					createdAt: stringField(record.created_at)
				}
			];
		})
	};
}

export async function updateGithubIssueState(
	config: IssueTrackerConfig,
	externalUrl: string,
	state: 'open' | 'closed'
): Promise<void> {
	if (!config.apiToken || !config.projectKey) return;

	const match = externalUrl.match(/\/issues\/(\d+)/);
	if (!match) return;

	const issueNumber = match[1];
	const res = await safeIntegrationFetch(
		`https://api.github.com/repos/${config.projectKey}/issues/${issueNumber}`,
		{
			method: 'PATCH',
			headers: {
				Authorization: `Bearer ${config.apiToken}`,
				'Content-Type': 'application/json',
				Accept: 'application/vnd.github+json'
			},
			body: JSON.stringify({ state })
		}
	);

	if (!res.ok) {
		throw new Error(`GitHub returned ${res.status}: ${await res.text()}`);
	}
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
	const res = await safeIntegrationFetch(url, {
		headers: {
			Authorization: `Bearer ${config.apiToken}`,
			Accept: 'application/vnd.github+json'
		}
	});

	if (!res.ok) {
		throw new Error(`GitHub returned ${res.status}: ${await res.text()}`);
	}

	const data = await res.json();
	const state = parseExternalIssueState(data);
	const statusCategory = issueStatusCategoryFromState(state);

	return { status: state, statusCategory };
}
