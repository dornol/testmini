import type {
	IssueTrackerConfig,
	CreateIssueResult,
	IssueStatusResult,
	IssueDetail
} from './integrations/types';
import { createJiraIssue, fetchJiraIssueStatus, testJiraConnection } from './integrations/jira';
import {
	createGithubIssue,
	fetchGithubIssueStatus,
	testGithubConnection,
	addGithubIssueComment,
	fetchGithubIssueDetail,
	updateGithubIssueState
} from './integrations/github';
import {
	createGitlabIssue,
	fetchGitlabIssueStatus,
	testGitlabConnection
} from './integrations/gitlab';
import {
	createGiteaIssue,
	fetchGiteaIssueStatus,
	testGiteaConnection,
	addGiteaIssueComment,
	fetchGiteaIssueDetail,
	updateGiteaIssueState
} from './integrations/gitea';
import { createCustomIssue } from './integrations/custom';
import { redactSecrets } from './secret-redaction';

// Re-export types for backwards compat
export type { IssueTrackerConfig, CreateIssueResult, IssueStatusResult, IssueDetail };

async function withRedactedIssueTrackerError<T>(
	config: IssueTrackerConfig,
	operation: () => Promise<T>
): Promise<T> {
	try {
		return await operation();
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Issue tracker operation failed';
		throw new Error(redactSecrets(message, [config.apiToken]));
	}
}

export async function createExternalIssue(
	config: IssueTrackerConfig,
	title: string,
	description: string,
	backlink?: string
): Promise<CreateIssueResult> {
	return withRedactedIssueTrackerError(config, async () => {
		switch (config.provider) {
			case 'JIRA':
				return createJiraIssue(config, title, description, backlink);
			case 'GITHUB':
				return createGithubIssue(config, title, description, backlink);
			case 'GITLAB':
				return createGitlabIssue(config, title, description, backlink);
			case 'GITEA':
				return createGiteaIssue(config, title, description, backlink);
			case 'CUSTOM':
				return createCustomIssue(config, title, description, backlink);
			default:
				throw new Error(`Unsupported provider: ${config.provider}`);
		}
	});
}

export async function fetchIssueStatus(
	config: IssueTrackerConfig,
	externalUrl: string,
	externalKey: string | null
): Promise<IssueStatusResult> {
	return withRedactedIssueTrackerError(config, async () => {
		switch (config.provider) {
			case 'JIRA':
				return fetchJiraIssueStatus(config, externalKey);
			case 'GITHUB':
				return fetchGithubIssueStatus(config, externalUrl);
			case 'GITLAB':
				return fetchGitlabIssueStatus(config, externalUrl);
			case 'GITEA':
				return fetchGiteaIssueStatus(config, externalUrl);
			default:
				return { status: 'unknown', statusCategory: 'unknown' };
		}
	});
}

export async function fetchIssueDetail(
	config: IssueTrackerConfig,
	externalUrl: string
): Promise<IssueDetail | null> {
	return withRedactedIssueTrackerError(config, async () => {
		switch (config.provider) {
			case 'GITHUB':
				return fetchGithubIssueDetail(config, externalUrl);
			case 'GITEA':
				return fetchGiteaIssueDetail(config, externalUrl);
			// JIRA, GitLab, CUSTOM: not yet supported
			default:
				return null;
		}
	});
}

export async function addIssueComment(
	config: IssueTrackerConfig,
	externalUrl: string,
	comment: string
): Promise<void> {
	return withRedactedIssueTrackerError(config, async () => {
		switch (config.provider) {
			case 'GITHUB':
				return addGithubIssueComment(config, externalUrl, comment);
			case 'GITEA':
				return addGiteaIssueComment(config, externalUrl, comment);
			// GitLab, JIRA, CUSTOM: not yet supported
			default:
				break;
		}
	});
}

export async function updateIssueState(
	config: IssueTrackerConfig,
	externalUrl: string,
	state: 'open' | 'closed'
): Promise<void> {
	return withRedactedIssueTrackerError(config, async () => {
		switch (config.provider) {
			case 'GITHUB':
				return updateGithubIssueState(config, externalUrl, state);
			case 'GITEA':
				return updateGiteaIssueState(config, externalUrl, state);
			default:
				throw new Error(`State change not supported for provider: ${config.provider}`);
		}
	});
}

export async function testConnection(
	config: IssueTrackerConfig
): Promise<{ ok: boolean; message: string }> {
	try {
		let result: { ok: boolean; message: string };
		switch (config.provider) {
			case 'JIRA':
				result = await testJiraConnection(config);
				break;
			case 'GITHUB':
				result = await testGithubConnection(config);
				break;
			case 'GITLAB':
				result = await testGitlabConnection(config);
				break;
			case 'GITEA':
				result = await testGiteaConnection(config);
				break;
			case 'CUSTOM':
				result = { ok: true, message: 'Custom provider configured (no connection test available)' };
				break;
			default:
				result = { ok: false, message: `Unsupported provider: ${config.provider}` };
		}
		return { ...result, message: redactSecrets(result.message, [config.apiToken]) };
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return { ok: false, message: redactSecrets(message, [config.apiToken]) };
	}
}
