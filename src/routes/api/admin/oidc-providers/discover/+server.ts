import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { requireAuth, isGlobalAdmin, parseJsonBody } from '$lib/server/auth-utils';
import { validatePublicHttpsUrl } from '$lib/server/url-safety';

const discoveryCache = new Map<string, { data: unknown; expiresAt: number }>();
const CACHE_TTL = 300_000; // 5 minutes
const FETCH_TIMEOUT = 10_000; // 10 seconds

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

	const body = (await parseJsonBody(request)) as Record<string, unknown>;
	const issuerUrl = (body.issuerUrl as string)?.trim()?.replace(/\/+$/, '');

	if (!issuerUrl) {
		error(400, 'issuerUrl is required');
	}

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
			authorizationUrl: config.authorization_endpoint ?? '',
			tokenUrl: config.token_endpoint ?? '',
			userinfoUrl: config.userinfo_endpoint ?? '',
			jwksUri: config.jwks_uri ?? ''
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
