import { badRequest } from '$lib/server/errors';
import { validatePublicHttpUrl } from '$lib/server/url-safety';

const VALID_EVENTS = [
	'TEST_RUN_COMPLETED',
	'TEST_FAILED',
	'COMMENT_ADDED',
	'MEMBER_ADDED',
	'ASSIGNED'
];

const MAX_WEBHOOK_NAME_LENGTH = 100;
const MAX_WEBHOOK_SECRET_LENGTH = 4000;

export interface WebhookFieldValidationOptions {
	requireName?: boolean;
	requireUrl?: boolean;
	allowEnabled?: boolean;
}

export interface ValidatedWebhookFields {
	name?: string;
	url?: string;
	secret?: string | null;
	events?: string[];
	enabled?: boolean;
}

export async function validateWebhookFields(
	body: unknown,
	options: WebhookFieldValidationOptions = {}
): Promise<ValidatedWebhookFields | Response> {
	if (!body || typeof body !== 'object' || Array.isArray(body)) {
		return badRequest('Invalid request body');
	}

	const input = body as Record<string, unknown>;
	const result: ValidatedWebhookFields = {};

	if (input.name !== undefined) {
		if (typeof input.name !== 'string') return badRequest('Name must be a string');
		const name = input.name.trim();
		if (!name || name.length > MAX_WEBHOOK_NAME_LENGTH) {
			return badRequest('Name is required (max 100 chars)');
		}
		result.name = name;
	} else if (options.requireName) {
		return badRequest('Name is required (max 100 chars)');
	}

	if (input.url !== undefined) {
		if (typeof input.url !== 'string') return badRequest('URL must be a string');
		const url = input.url.trim();
		if (!url) return badRequest('URL is required');
		const urlValidation = await validatePublicHttpUrl(url);
		if (!urlValidation.ok) return badRequest(urlValidation.error ?? 'Invalid URL');
		result.url = url;
	} else if (options.requireUrl) {
		return badRequest('URL is required');
	}

	if (input.secret !== undefined) {
		if (typeof input.secret !== 'string') return badRequest('Secret must be a string');
		const secret = input.secret.trim();
		if (secret.length > MAX_WEBHOOK_SECRET_LENGTH) {
			return badRequest(`Secret must be ${MAX_WEBHOOK_SECRET_LENGTH} characters or less`);
		}
		result.secret = secret || null;
	}

	if (input.events !== undefined) {
		if (
			!Array.isArray(input.events) ||
			input.events.some((event) => typeof event !== 'string')
		) {
			return badRequest('Events must be an array of strings');
		}
		for (const event of input.events) {
			if (!VALID_EVENTS.includes(event)) return badRequest(`Invalid event type: ${event}`);
		}
		result.events = input.events;
	}

	if (input.enabled !== undefined) {
		if (!options.allowEnabled) return badRequest('Enabled cannot be set here');
		if (typeof input.enabled !== 'boolean') return badRequest('Enabled must be a boolean');
		result.enabled = input.enabled;
	}

	return result;
}
