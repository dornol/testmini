import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { issueLink, issueTrackerConfig, testCase } from '$lib/server/db/schema';
import { eq, and, or, inArray } from 'drizzle-orm';
import { childLogger } from '$lib/server/logger';
import crypto from 'node:crypto';

const log = childLogger('issue-webhook');

// ── Types ───────────────────────────────────────────────

interface GitHubIssuePayload {
	action: string;
	issue: {
		number: number;
		state: string;
		title: string;
		html_url: string;
	};
	repository: {
		full_name: string;
	};
}

interface GitLabIssuePayload {
	object_kind: 'issue';
	object_attributes: {
		iid: number;
		state: string;
		title: string;
		url: string;
		action: string;
	};
	project: {
		id: number;
		path_with_namespace: string;
		web_url: string;
	};
}

interface GiteaIssuePayload {
	action: string;
	number: number;
	issue: {
		number: number;
		state: string;
		title: string;
		html_url: string;
	};
	repository: {
		full_name: string;
	};
}

interface ParsedEvent {
	provider: 'GITHUB' | 'GITLAB' | 'GITEA';
	action: string;
	issueNumber: number;
	issueState: string;
	issueUrl: string;
	repoKey: string;
}

// ── Helpers ─────────────────────────────────────────────

function verifySignature(
	secret: string,
	body: string,
	signatureHeader: string | null,
	algorithm: 'sha256' | 'sha1' = 'sha256'
): boolean {
	if (!signatureHeader) return false;

	// GitHub: sha256=<hex>, GitLab: just token comparison, Gitea: sha256=<hex>
	const expected = crypto.createHmac(algorithm, secret).update(body).digest('hex');
	const prefix = `${algorithm}=`;

	const provided = signatureHeader.startsWith(prefix)
		? signatureHeader.slice(prefix.length)
		: signatureHeader;

	try {
		return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(provided, 'hex'));
	} catch {
		return false;
	}
}

function parseEvent(request: Request, body: unknown): ParsedEvent | null {
	const githubEvent = request.headers.get('x-github-event');
	const gitlabEvent = request.headers.get('x-gitlab-event');
	const giteaEvent = request.headers.get('x-gitea-event');

	if (githubEvent === 'issues') {
		const p = body as GitHubIssuePayload;
		if (!p.issue || !p.repository) return null;
		return {
			provider: 'GITHUB',
			action: p.action,
			issueNumber: p.issue.number,
			issueState: p.issue.state,
			issueUrl: p.issue.html_url,
			repoKey: p.repository.full_name
		};
	}

	if (gitlabEvent === 'Issue Hook' || (body as GitLabIssuePayload).object_kind === 'issue') {
		const p = body as GitLabIssuePayload;
		if (!p.object_attributes || !p.project) return null;
		return {
			provider: 'GITLAB',
			action: p.object_attributes.action,
			issueNumber: p.object_attributes.iid,
			issueState: p.object_attributes.state,
			issueUrl: p.object_attributes.url,
			repoKey: String(p.project.id)
		};
	}

	if (giteaEvent === 'issues') {
		const p = body as GiteaIssuePayload;
		if (!p.issue || !p.repository) return null;
		return {
			provider: 'GITEA',
			action: p.action,
			issueNumber: p.issue.number,
			issueState: p.issue.state,
			issueUrl: p.issue.html_url,
			repoKey: p.repository.full_name
		};
	}

	return null;
}

function stateToCategory(state: string): 'open' | 'done' {
	return state === 'closed' ? 'done' : 'open';
}

// ── Handler ─────────────────────────────────────────────

export const POST: RequestHandler = async ({ request }) => {
	const contentLength = Number(request.headers.get('content-length') ?? 0);
	if (contentLength > 1024 * 1024) {
		return json({ error: 'Request body must not exceed 1MB' }, { status: 413 });
	}

	// Read raw body for signature verification
	const rawBody = await request.text();

	let body: unknown;
	try {
		body = JSON.parse(rawBody);
	} catch {
		return json({ error: 'Invalid JSON' }, { status: 400 });
	}

	// Ping events (webhook setup verification)
	if (
		request.headers.get('x-github-event') === 'ping' ||
		request.headers.get('x-gitea-event') === 'ping' ||
		request.headers.get('x-gitlab-event') === 'ping'
	) {
		return json({ received: true, message: 'Ping acknowledged' });
	}

	const event = parseEvent(request, body);
	if (!event) {
		return json({ received: true, message: 'Event type not handled' });
	}

	// Find matching issue tracker configs for this provider + repoKey
	const configs = await db
		.select()
		.from(issueTrackerConfig)
		.where(
			and(
				eq(issueTrackerConfig.provider, event.provider),
				eq(issueTrackerConfig.enabled, true),
				eq(issueTrackerConfig.projectKey, event.repoKey)
			)
		);

	if (configs.length === 0) {
		log.debug({ provider: event.provider, repoKey: event.repoKey }, 'No matching issue tracker config');
		return json({ received: true, matched: 0 });
	}

	let totalUpdated = 0;
	const retestCaseIds: number[] = [];

	for (const config of configs) {
		// Verify webhook signature if secret is configured
		if (config.webhookSecret) {
			let valid = false;
			if (event.provider === 'GITHUB') {
				valid = verifySignature(config.webhookSecret, rawBody, request.headers.get('x-hub-signature-256'));
			} else if (event.provider === 'GITEA') {
				// Gitea uses X-Gitea-Signature with HMAC-SHA256 (hex, no prefix)
				const sig = request.headers.get('x-gitea-signature');
				const expected = crypto.createHmac('sha256', config.webhookSecret).update(rawBody).digest('hex');
				try {
					valid = sig ? crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(sig, 'hex')) : false;
				} catch {
					valid = false;
				}
			} else if (event.provider === 'GITLAB') {
				// GitLab uses X-Gitlab-Token (plain token comparison)
				valid = request.headers.get('x-gitlab-token') === config.webhookSecret;
			}

			if (!valid) {
				log.warn({ projectId: config.projectId, provider: event.provider }, 'Webhook signature verification failed');
				continue;
			}
		}

		// Find matching issue links by URL pattern or external key
		const externalKey = `#${event.issueNumber}`;
		const links = await db
			.select()
			.from(issueLink)
			.where(
				and(
					eq(issueLink.projectId, config.projectId),
					eq(issueLink.provider, event.provider),
					or(
						eq(issueLink.externalUrl, event.issueUrl),
						eq(issueLink.externalKey, externalKey)
					)
				)
			);

		if (links.length === 0) continue;

		const linkIds = links.map((l) => l.id);
		await db
			.update(issueLink)
			.set({
				status: event.issueState,
				statusSyncedAt: new Date()
			})
			.where(inArray(issueLink.id, linkIds));

		totalUpdated += links.length;

		// Track test cases that need retesting when issue is resolved
		if (stateToCategory(event.issueState) === 'done') {
			for (const link of links) {
				if (link.testCaseId) retestCaseIds.push(link.testCaseId);
			}
		}
	}

	// Mark linked test cases as retest needed
	if (retestCaseIds.length > 0) {
		await db
			.update(testCase)
			.set({ retestNeeded: true })
			.where(inArray(testCase.id, retestCaseIds));
	}

	log.info({
		provider: event.provider,
		issueNumber: event.issueNumber,
		state: event.issueState,
		updated: totalUpdated,
		retestMarked: retestCaseIds.length
	}, 'Issue webhook processed');

	return json({
		received: true,
		updated: totalUpdated,
		retestMarked: retestCaseIds.length
	});
};
