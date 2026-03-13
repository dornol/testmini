import { db } from '$lib/server/db';
import { projectWebhook, webhookDeliveryLog } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { childLogger } from './logger';
import crypto from 'node:crypto';

const log = childLogger('webhooks');

export const MAX_RETRIES = 3;
export const RETRY_DELAYS = [1_000, 5_000, 30_000]; // 1s, 5s, 30s
const MAX_RESPONSE_BODY_LENGTH = 4096;

export interface WebhookPayload {
	event: string;
	projectId: number;
	timestamp: string;
	data: Record<string, unknown>;
}

/**
 * Sends webhook notifications to all enabled webhooks for a project that subscribe to the given event.
 * Fire-and-forget: errors are logged but never propagated.
 * Failed deliveries are retried with exponential backoff (1s, 5s, 30s).
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
			matching.map((w) => deliverWithRetry(w.id, w.url, w.secret, event, body))
		);
	} catch (err) {
		log.error({ err, projectId, event }, 'Failed to send project webhooks');
	}
}

async function deliverWithRetry(
	webhookId: number,
	url: string,
	secret: string | null,
	event: string,
	body: string
): Promise<void> {
	for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
		const result = await deliverWebhook(url, secret, body);

		// Log to DB
		try {
			await db.insert(webhookDeliveryLog).values({
				webhookId,
				event,
				url,
				requestBody: body.length > MAX_RESPONSE_BODY_LENGTH ? body.slice(0, MAX_RESPONSE_BODY_LENGTH) : body,
				statusCode: result.statusCode,
				responseBody: result.responseBody?.slice(0, MAX_RESPONSE_BODY_LENGTH) ?? null,
				success: result.success,
				errorMessage: result.errorMessage,
				attempt,
				duration: result.duration
			});
		} catch (err) {
			log.error({ err, webhookId }, 'Failed to save webhook delivery log');
		}

		if (result.success) return;

		// Don't retry on the last attempt
		if (attempt < MAX_RETRIES) {
			await sleep(RETRY_DELAYS[attempt - 1]);
		}
	}
}

interface DeliveryResult {
	success: boolean;
	statusCode: number | null;
	responseBody: string | null;
	errorMessage: string | null;
	duration: number;
}

async function deliverWebhook(
	url: string,
	secret: string | null,
	body: string
): Promise<DeliveryResult> {
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
	const start = Date.now();

	try {
		const res = await fetch(url, {
			method: 'POST',
			headers,
			body,
			signal: controller.signal
		});

		const duration = Date.now() - start;
		let responseBody: string | null = null;
		try {
			responseBody = await res.text();
		} catch {
			// ignore
		}

		const success = res.ok;
		if (!success) {
			log.warn({ url, status: res.status }, 'Webhook delivery failed');
		}

		return {
			success,
			statusCode: res.status,
			responseBody,
			errorMessage: success ? null : `HTTP ${res.status}`,
			duration
		};
	} catch (err) {
		const duration = Date.now() - start;
		const errorMessage = err instanceof Error ? err.message : String(err);
		log.warn({ err, url }, 'Webhook delivery error');

		return {
			success: false,
			statusCode: null,
			responseBody: null,
			errorMessage,
			duration
		};
	} finally {
		clearTimeout(timeout);
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
