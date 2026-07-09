import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { requireAuth, isGlobalAdmin, parseJsonBody } from '$lib/server/auth-utils';
import { validatePublicHttpsUrl } from '$lib/server/url-safety';
import { isPlainRecord } from '$lib/server/object-validation';

const discoveryCache = new Map<string, { data: unknown; expiresAt: number }>();
const CACHE_TTL = 300_000; // 5 minutes
const FETCH_TIMEOUT = 10_000; // 10 seconds

function isRecord(value: unknown): value is Record<string, unknown> {
	return isPlainRecord(value);
}

function parseIssuerUrl(body: unknown): string {
	if (!isRecord(body)) {
		error(400, 'issuerUrl is required');
	}

	const rawIssuerUrl = body.issuerUrl;
	if (typeof rawIssuerUrl !== 'string') {
		error(400, 'issuerUrl is required');
	}

	const issuerUrl = rawIssuerUrl.trim().replace(/\/+$/, '');
	if (!issuerUrl) {
		error(400, 'issuerUrl is required');
	}

	return issuerUrl;
}

function readStringField(source: unknown, field: string): string {
	if (!isRecord(source)) return '';
	const value = source[field];
	return typeof value === 'string' ? value : '';
}

function readRequiredStringField(source: unknown, field: string): string {
	const value = readStringField(source, field).trim();
	if (!value) {
		error(400, `OpenID configuration is missing ${field}`);
	}
	return value;
}

async function assertSafeIssuerUrl(issuerUrl: string): Promise<void> {
	const validation = await validatePublicHttpsUrl(issuerUrl);
	if (!validation.ok) {
		error(400, `issuerUrl: ${validation.error ?? 'Invalid URL'}`);
	}
}

// ---------------------------------------------------------------------------
// Request handler
// ---------------------------------------------------------------------------

export const POST: RequestHandler = async ({ request, locals }) => {
	const user = requireAuth(locals);
	if (!isGlobalAdmin(user)) {
		error(403, 'Admin access required');
	}

	const issuerUrl = parseIssuerUrl(await parseJsonBody(request));

	// SSRF defence: validate URL scheme and resolved IP before fetching.
	await assertSafeIssuerUrl(issuerUrl);

	// Check cache after validation (no point caching before we know it's safe).
	const cached = discoveryCache.get(issuerUrl);
	if (cached && cached.expiresAt > Date.now()) {
		return json(cached.data);
	}

	try {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

		const res = await fetch(`${issuerUrl}/.well-known/openid-configuration`, {
			redirect: 'manual',
			signal: controller.signal
		});
		clearTimeout(timeout);

		if (!res.ok) {
			error(400, 'Failed to fetch OpenID configuration');
		}

		const config = await res.json();

		const data = {
			authorizationUrl: readRequiredStringField(config, 'authorization_endpoint'),
			tokenUrl: readRequiredStringField(config, 'token_endpoint'),
			userinfoUrl: readStringField(config, 'userinfo_endpoint'),
			jwksUri: readRequiredStringField(config, 'jwks_uri')
		};

		// Cache the result
		discoveryCache.set(issuerUrl, { data, expiresAt: Date.now() + CACHE_TTL });

		return json(data);
	} catch (e) {
		if (e && typeof e === 'object' && 'status' in e) throw e;
		if (e instanceof DOMException && e.name === 'AbortError') {
			error(400, 'OpenID configuration request timed out');
		}
		error(400, 'Failed to discover OpenID configuration');
	}
};
