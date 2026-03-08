import { sequence } from '@sveltejs/kit/hooks';
import { building } from '$app/environment';
import { redirect } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import type { Handle, HandleServerError } from '@sveltejs/kit';
import { getTextDirection } from '$lib/paraglide/runtime';
import { paraglideMiddleware } from '$lib/paraglide/server';
import { checkRateLimit } from '$lib/server/rate-limit';
import { logger } from '$lib/server/logger';
import { runMigrations } from '$lib/server/db/migrate';
import { seedAdminUser } from '$lib/server/db/seed';
import { initReportScheduler } from '$lib/server/report-scheduler';
import { db } from '$lib/server/db';
import { user as userTable } from '$lib/server/db/auth.schema';
import { eq } from 'drizzle-orm';

if (!building) {
	runMigrations()
		.then(() => seedAdminUser())
		.then(() => initReportScheduler())
		.catch((err) => {
			logger.fatal({ err }, 'Startup failed — migration or seed error');
			process.exit(1);
		});
}

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

	// Only let better-auth handle its own API routes
	if (event.url.pathname.startsWith('/api/auth')) {
		return svelteKitHandler({ event, resolve, auth, building });
	}

	// Approval guard: unapproved users can only access /auth/pending and /api/auth
	if (session?.user) {
		const { pathname } = event.url;
		const allowedPaths = ['/auth/pending', '/api/auth', '/_app/', '/favicon', '/shared/'];
		const isAllowed = allowedPaths.some((p) => pathname.startsWith(p));

		if (!isAllowed) {
			const [dbUser] = await db
				.select({ approved: userTable.approved })
				.from(userTable)
				.where(eq(userTable.id, session.user.id));

			if (dbUser && !dbUser.approved) {
				redirect(302, '/auth/pending');
			}
		}
	}

	return resolve(event);
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
	apiKeyLimit?: number;
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
		apiKeyLimit: 100,
		windowMs: 60_000
	},
	// Bulk operations — matches any /api/<anything>/bulk POST
	{
		label: 'api:bulk',
		match: (p, m) => /^\/api\/[^/]+(?:\/[^/]+)*\/bulk$/.test(p) && m === 'POST',
		limit: 20,
		apiKeyLimit: 60,
		windowMs: 60_000
	},
	// General API catch-all
	{
		label: 'api:general',
		match: (p) => p.startsWith('/api/'),
		limit: 100,
		apiKeyLimit: 300,
		windowMs: 60_000
	}
];

const handleRateLimit: Handle = async ({ event, resolve }) => {
	const { pathname } = new URL(event.request.url);
	const method = event.request.method.toUpperCase();

	const rule = RATE_LIMIT_RULES.find((r) => r.match(pathname, method));

	if (rule) {
		const ip = event.getClientAddress();

		// Lightweight API key detection — full auth happens later in the pipeline
		const authHeader = event.request.headers.get('authorization');
		const isApiKey = authHeader?.startsWith('Bearer tmk_') ?? false;

		const limit = (isApiKey && rule.apiKeyLimit) ? rule.apiKeyLimit : rule.limit;
		const key = isApiKey
			? `${rule.label}:apikey:${pathname.split('/')[2] ?? 'unknown'}`
			: `${rule.label}:${ip}`;

		const result = await checkRateLimit(key, limit, rule.windowMs);

		if (!result.allowed) {
			const retryAfter = result.retryAfter ?? Math.ceil(rule.windowMs / 1000);
			logger.warn({ ip, path: pathname, label: rule.label }, 'rate limited');
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

/** Paths that are excluded from request logging (static assets, health checks). */
const SKIP_LOGGING_PREFIXES = ['/_app/', '/favicon', '/robots.txt', '/health'];

const SLOW_REQUEST_THRESHOLD_MS = 1000;

const handleRequestLogging: Handle = async ({ event, resolve }) => {
	const { pathname } = new URL(event.request.url);

	// Assign a unique request ID and expose it on locals for downstream use.
	const requestId = crypto.randomUUID();
	event.locals.requestId = requestId;

	// Skip logging for static assets and health-check endpoints.
	if (SKIP_LOGGING_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
		return resolve(event);
	}

	const start = Date.now();
	const method = event.request.method.toUpperCase();

	const response = await resolve(event);

	const durationMs = Date.now() - start;
	const status = response.status;

	const meta = { requestId, method, path: pathname, status, durationMs };

	if (durationMs > SLOW_REQUEST_THRESHOLD_MS) {
		logger.warn(meta, 'slow request');
	}

	if (status >= 500) {
		logger.error(meta, 'Request completed');
	} else if (status >= 400) {
		logger.warn(meta, 'Request completed');
	} else {
		logger.info(meta, 'Request completed');
	}

	return response;
};

export const handle: Handle = sequence(
	handleRequestLogging,
	handleParaglide,
	handleRateLimit,
	handleBetterAuth,
	handleSecurityHeaders
);

export const handleError: HandleServerError = ({ error, event, status, message }) => {
	const requestId = event.locals?.requestId;

	logger.error(
		{
			requestId,
			method: event.request.method.toUpperCase(),
			path: new URL(event.request.url).pathname,
			status,
			err: error instanceof Error
				? { message: error.message, stack: error.stack, name: error.name }
				: error
		},
		message ?? 'Unexpected server error'
	);

	// Return a safe error object that SvelteKit can serialise to the client.
	return { message: 'An unexpected error occurred.' };
};
