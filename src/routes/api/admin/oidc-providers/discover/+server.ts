import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { requireAuth, isGlobalAdmin, parseJsonBody } from '$lib/server/auth-utils';
import { lookup } from 'dns/promises';

const discoveryCache = new Map<string, { data: unknown; expiresAt: number }>();
const CACHE_TTL = 300_000; // 5 minutes
const FETCH_TIMEOUT = 10_000; // 10 seconds

// ---------------------------------------------------------------------------
// SSRF defence helpers
// ---------------------------------------------------------------------------

/**
 * Validate that the issuer URL is safe to fetch:
 *  - Must be a well-formed URL.
 *  - Must use HTTPS (HTTP is permitted only for localhost in development).
 *  - Hostname must not resolve to a private / link-local / loopback address
 *    (checked after DNS resolution to prevent DNS rebinding attacks).
 *
 * Throws a SvelteKit `error(400, …)` on any violation.
 */
async function assertSafeIssuerUrl(issuerUrl: string): Promise<void> {
	// 1. Parse URL — rejects obviously malformed input.
	let parsed: URL;
	try {
		parsed = new URL(issuerUrl);
	} catch {
		error(400, 'issuerUrl is not a valid URL');
	}

	const { protocol, hostname } = parsed;

	// 2. Protocol check: only https (or http://localhost for dev).
	const isLocalhost =
		hostname === 'localhost' ||
		hostname === '127.0.0.1' ||
		hostname === '::1';

	if (protocol !== 'https:' && !(protocol === 'http:' && isLocalhost)) {
		error(400, 'issuerUrl must use HTTPS');
	}

	// 3. Resolve the hostname and block private / internal ranges.
	//    Skip DNS resolution for literal IP addresses too — they are validated directly.
	let addresses: string[];
	try {
		// `all: true` returns every A/AAAA record so we can check them all.
		const records = await lookup(hostname, { all: true });
		addresses = records.map((r) => r.address);
	} catch {
		error(400, 'issuerUrl hostname could not be resolved');
	}

	for (const addr of addresses) {
		if (isPrivateIp(addr)) {
			error(400, 'issuerUrl resolves to a private or reserved IP address');
		}
	}
}

/**
 * Returns true if the given IPv4 or IPv6 address falls within a private,
 * loopback, link-local, or other reserved range that should never be
 * reachable from the public internet.
 *
 * Blocked ranges:
 *   IPv4  127.0.0.0/8       — loopback
 *   IPv4  10.0.0.0/8        — private
 *   IPv4  172.16.0.0/12     — private
 *   IPv4  192.168.0.0/16    — private
 *   IPv4  169.254.0.0/16    — link-local (APIPA)
 *   IPv4  0.0.0.0/8         — "this" network
 *   IPv4  100.64.0.0/10     — shared address space (RFC 6598)
 *   IPv6  ::1               — loopback
 *   IPv6  fc00::/7          — unique-local (fc00:: – fdff::)
 *   IPv6  fe80::/10         — link-local
 */
function isPrivateIp(addr: string): boolean {
	// IPv6
	if (addr.includes(':')) {
		const normalized = expandIPv6(addr).toLowerCase();
		// Loopback ::1
		if (normalized === '0000:0000:0000:0000:0000:0000:0000:0001') return true;
		// Link-local fe80::/10
		if (/^fe[89ab][0-9a-f]:/.test(normalized)) return true;
		// Unique-local fc00::/7 (fc00:: – fdff::)
		if (/^f[cd][0-9a-f]{2}:/.test(normalized)) return true;
		return false;
	}

	// IPv4
	const parts = addr.split('.').map(Number);
	if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) return false;
	const [a, b] = parts;

	if (a === 127) return true;                              // 127.0.0.0/8 loopback
	if (a === 10) return true;                               // 10.0.0.0/8
	if (a === 172 && b >= 16 && b <= 31) return true;       // 172.16.0.0/12
	if (a === 192 && b === 168) return true;                 // 192.168.0.0/16
	if (a === 169 && b === 254) return true;                 // 169.254.0.0/16 link-local
	if (a === 0) return true;                                // 0.0.0.0/8
	if (a === 100 && b >= 64 && b <= 127) return true;      // 100.64.0.0/10 shared

	return false;
}

/**
 * Expand a possibly-compressed IPv6 address to its full 8-group form
 * so we can do simple prefix matching.
 */
function expandIPv6(addr: string): string {
	// Strip brackets if present (e.g. [::1])
	addr = addr.replace(/^\[|\]$/g, '');

	// Handle embedded IPv4 (e.g. ::ffff:192.168.1.1) — treat as private
	if (addr.includes('.')) return '0000:0000:0000:0000:0000:ffff:0000:0000';

	const halves = addr.split('::');
	let groups: string[];

	if (halves.length === 2) {
		const left = halves[0] ? halves[0].split(':') : [];
		const right = halves[1] ? halves[1].split(':') : [];
		const missing = 8 - left.length - right.length;
		groups = [...left, ...Array(missing).fill('0'), ...right];
	} else {
		groups = addr.split(':');
	}

	return groups.map((g) => g.padStart(4, '0')).join(':');
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
