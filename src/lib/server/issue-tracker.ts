export interface IssueTrackerConfig {
	provider: string;
	baseUrl: string;
	apiToken: string | null;
	projectKey: string | null;
	customTemplate: Record<string, unknown> | null;
}

export interface CreateIssueResult {
	url: string;
	key: string;
	title: string;
}

export interface IssueStatusResult {
	status: string;
	statusCategory: 'open' | 'in_progress' | 'done' | 'unknown';
}

export async function createExternalIssue(
	config: IssueTrackerConfig,
	title: string,
	description: string,
	backlink?: string
): Promise<CreateIssueResult> {
	switch (config.provider) {
		case 'JIRA':
			return createJiraIssue(config, title, description, backlink);
		case 'GITHUB':
			return createGithubIssue(config, title, description, backlink);
		case 'GITLAB':
			return createGitlabIssue(config, title, description, backlink);
		case 'CUSTOM':
			return createCustomIssue(config, title, description, backlink);
		default:
			throw new Error(`Unsupported provider: ${config.provider}`);
	}
}

export async function fetchIssueStatus(
	config: IssueTrackerConfig,
	externalUrl: string,
	externalKey: string | null
): Promise<IssueStatusResult> {
	switch (config.provider) {
		case 'JIRA':
			return fetchJiraIssueStatus(config, externalKey);
		case 'GITHUB':
			return fetchGithubIssueStatus(config, externalUrl);
		case 'GITLAB':
			return fetchGitlabIssueStatus(config, externalUrl);
		default:
			return { status: 'unknown', statusCategory: 'unknown' };
	}
}

export async function testConnection(
	config: IssueTrackerConfig
): Promise<{ ok: boolean; message: string }> {
	try {
		switch (config.provider) {
			case 'JIRA':
				return await testJiraConnection(config);
			case 'GITHUB':
				return await testGithubConnection(config);
			case 'GITLAB':
				return await testGitlabConnection(config);
			case 'CUSTOM':
				return { ok: true, message: 'Custom provider configured (no connection test available)' };
			default:
				return { ok: false, message: `Unsupported provider: ${config.provider}` };
		}
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return { ok: false, message };
	}
}

// ── Jira ──────────────────────────────────────────────

function jiraAuthHeader(config: IssueTrackerConfig): string {
	if (!config.apiToken) throw new Error('API token is required for Jira');
	// apiToken stored as "email:token" for Jira Basic auth
	const token = config.apiToken.includes(':')
		? config.apiToken
		: `user@example.com:${config.apiToken}`;
	return `Basic ${btoa(token)}`;
}

async function testJiraConnection(config: IssueTrackerConfig): Promise<{ ok: boolean; message: string }> {
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

async function createJiraIssue(
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

async function fetchJiraIssueStatus(
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

// ── GitHub ─────────────────────────────────────────────

async function testGithubConnection(config: IssueTrackerConfig): Promise<{ ok: boolean; message: string }> {
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

async function createGithubIssue(
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

async function fetchGithubIssueStatus(
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

// ── GitLab ─────────────────────────────────────────────

async function testGitlabConnection(config: IssueTrackerConfig): Promise<{ ok: boolean; message: string }> {
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

async function createGitlabIssue(
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

async function fetchGitlabIssueStatus(
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

// ── Custom ─────────────────────────────────────────────

async function createCustomIssue(
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
