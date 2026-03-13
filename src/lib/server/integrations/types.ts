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

export interface IssueComment {
	id: number;
	body: string;
	author: string;
	authorAvatar?: string;
	createdAt: string;
}

export interface IssueDetail {
	title: string;
	body: string;
	state: string;
	stateCategory: 'open' | 'in_progress' | 'done' | 'unknown';
	author: string;
	authorAvatar?: string;
	labels: { name: string; color: string }[];
	createdAt: string;
	updatedAt: string;
	closedAt: string | null;
	comments: IssueComment[];
}
