import { sequence } from '@sveltejs/kit/hooks';
import { building } from '$app/environment';
import { auth } from '$lib/server/auth';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import type { Handle } from '@sveltejs/kit';
import { getTextDirection } from '$lib/paraglide/runtime';
import { paraglideMiddleware } from '$lib/paraglide/server';
import { checkRateLimit } from '$lib/server/rate-limit';

const handleParaglide: Handle = ({ event, resolve }) => paraglideMiddleware(event.request, ({ request, locale }) => {
	event.request = request;

	return resolve(event, {
		transformPageChunk: ({ html }) => html.replace('%paraglide.lang%', locale).replace('%paraglide.dir%', getTextDirection(locale))
	});
});

const handleBetterAuth: Handle = async ({ event, resolve }) => {
	const session = await auth.api.getSession({ headers: event.request.headers });

	if (session) {
		event.locals.session = session.session;
		event.locals.user = session.user;
	}

	return svelteKitHandler({ event, resolve, auth, building });
};

/**
 * Rate limiting configuration.
 *
 * Rules are evaluated in order; the FIRST matching rule wins.
 * More specific paths must be listed before broader catch-alls.
 */
interface RateLimitRule {
	/** Returns true when this rule applies to the given pathname + method. */
	match: (pathname: string, method: string) => boolean;
	limit: number;
	windowMs: number;
	label: string;
}

const RATE_LIMIT_RULES: RateLimitRule[] = [
	// Auth endpoints — brute-force protection
	{
		label: 'auth:sign-in',
		match: (p) => p === '/api/auth/sign-in',
		limit: 10,
		windowMs: 60_000
	},
	{
		label: 'auth:sign-up',
		match: (p) => p === '/api/auth/sign-up',
		limit: 10,
		windowMs: 60_000
	},
	// File uploads
	{
		label: 'api:attachments',
		match: (p, m) => p === '/api/attachments' && m === 'POST',
		limit: 30,
		windowMs: 60_000
	},
	// Bulk operations — matches any /api/<anything>/bulk POST
	{
		label: 'api:bulk',
		match: (p, m) => /^\/api\/[^/]+(?:\/[^/]+)*\/bulk$/.test(p) && m === 'POST',
		limit: 20,
		windowMs: 60_000
	},
	// General API catch-all
	{
		label: 'api:general',
		match: (p) => p.startsWith('/api/'),
		limit: 100,
		windowMs: 60_000
	}
];

const handleRateLimit: Handle = async ({ event, resolve }) => {
	const { pathname } = new URL(event.request.url);
	const method = event.request.method.toUpperCase();

	const rule = RATE_LIMIT_RULES.find((r) => r.match(pathname, method));

	if (rule) {
		const ip = event.getClientAddress();
		const key = `${rule.label}:${ip}`;

		const result = await checkRateLimit(key, rule.limit, rule.windowMs);

		if (!result.allowed) {
			const retryAfter = result.retryAfter ?? Math.ceil(rule.windowMs / 1000);
			return new Response(
				JSON.stringify({ error: 'Too Many Requests', retryAfter }),
				{
					status: 429,
					headers: {
						'Content-Type': 'application/json',
						'Retry-After': String(retryAfter)
					}
				}
			);
		}
	}

	return resolve(event);
};

const handleSecurityHeaders: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set('X-XSS-Protection', '1; mode=block');
	return response;
};

export const handle: Handle = sequence(handleParaglide, handleRateLimit, handleBetterAuth, handleSecurityHeaders);
