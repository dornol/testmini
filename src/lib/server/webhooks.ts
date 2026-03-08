import { db } from '$lib/server/db';
import { projectWebhook } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { childLogger } from './logger';
import crypto from 'node:crypto';

const log = childLogger('webhooks');

export interface WebhookPayload {
	event: string;
	projectId: number;
	timestamp: string;
	data: Record<string, unknown>;
}

/**
 * Sends webhook notifications to all enabled webhooks for a project that subscribe to the given event.
 * Fire-and-forget: errors are logged but never propagated.
 */
export async function sendProjectWebhooks(
	projectId: number,
	event: string,
	data: Record<string, unknown>
): Promise<void> {
	try {
		const webhooks = await db
			.select()
			.from(projectWebhook)
			.where(and(eq(projectWebhook.projectId, projectId), eq(projectWebhook.enabled, true)));

		const matching = webhooks.filter(
			(w) => w.events.length === 0 || w.events.includes(event)
		);

		if (matching.length === 0) return;

		const payload: WebhookPayload = {
			event,
			projectId,
			timestamp: new Date().toISOString(),
			data
		};

		const body = JSON.stringify(payload);

		await Promise.allSettled(
			matching.map((w) => deliverWebhook(w.url, w.secret, body))
		);
	} catch (err) {
		log.error({ err, projectId, event }, 'Failed to send project webhooks');
	}
}

async function deliverWebhook(url: string, secret: string | null, body: string): Promise<void> {
	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
		'User-Agent': 'testmini-webhook/1.0'
	};

	if (secret) {
		const signature = crypto
			.createHmac('sha256', secret)
			.update(body)
			.digest('hex');
		headers['X-Webhook-Signature'] = `sha256=${signature}`;
	}

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 10_000);

	try {
		const res = await fetch(url, {
			method: 'POST',
			headers,
			body,
			signal: controller.signal
		});

		if (!res.ok) {
			log.warn({ url, status: res.status }, 'Webhook delivery failed');
		}
	} catch (err) {
		log.warn({ err, url }, 'Webhook delivery error');
	} finally {
		clearTimeout(timeout);
	}
}