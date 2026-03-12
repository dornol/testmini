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
