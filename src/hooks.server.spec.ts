import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mock all dependencies before importing hooks ---

const mockLogger = {
	info: vi.fn(),
	warn: vi.fn(),
	error: vi.fn(),
	debug: vi.fn(),
	fatal: vi.fn(),
	child: vi.fn(() => mockLogger)
};

vi.mock('$lib/server/logger', () => ({
	logger: mockLogger,
	childLogger: vi.fn(() => mockLogger)
}));

vi.mock('$app/environment', () => ({
	building: true // prevent startup migrations/seed from running
}));

vi.mock('@sveltejs/kit/hooks', () => ({
	sequence: (...handlers: unknown[]) => {
		// Return a handle function that chains all handlers in sequence
		return async ({ event, resolve }: { event: unknown; resolve: unknown }) => {
			let currentResolve = resolve;
			// Chain handlers in reverse order so the first handler is outermost
			for (let i = handlers.length - 1; i >= 0; i--) {
				const handler = handlers[i] as (opts: {
					event: unknown;
					resolve: unknown;
				}) => Promise<Response>;
				const nextResolve = currentResolve;
				currentResolve = (evt: unknown) => handler({ event: evt, resolve: nextResolve as never });
			}
			return (currentResolve as (evt: unknown) => Promise<Response>)(event);
		};
	}
}));

vi.mock('@sveltejs/kit', () => ({
	redirect: (status: number, location: string) => {
		throw { status, location };
	},
	error: (status: number, message: string) => {
		throw { status, body: { message } };
	}
}));

vi.mock('$lib/server/auth', () => ({
	auth: {
		api: {
			getSession: vi.fn().mockResolvedValue(null)
		}
	}
}));

vi.mock('better-auth/svelte-kit', () => ({
	svelteKitHandler: vi.fn().mockResolvedValue(new Response('ok'))
}));

vi.mock('$lib/paraglide/runtime', () => ({
	getTextDirection: vi.fn().mockReturnValue('ltr')
}));

vi.mock('$lib/paraglide/server', () => ({
	paraglideMiddleware: vi.fn((_req: unknown, cb: (opts: { request: Request; locale: string }) => Response) => {
		// Just pass through to the callback with the original request
		return cb({ request: _req as Request, locale: 'en' });
	})
}));

vi.mock('$lib/server/rate-limit', () => ({
	checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 99 })
}));

vi.mock('$lib/server/db/migrate', () => ({
	runMigrations: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('$lib/server/db/seed', () => ({
	seedAdminUser: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('$lib/server/report-scheduler', () => ({
	initReportScheduler: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('$lib/server/db', () => ({
	db: {
		select: vi.fn().mockReturnValue({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockResolvedValue([{ approved: true }])
			})
		})
	}
}));

vi.mock('$lib/server/db/auth.schema', () => ({
	user: { id: 'id', approved: 'approved' }
}));

vi.mock('drizzle-orm', () => ({
	eq: vi.fn()
}));

// --- Import the handle function after mocks are set up ---

const { handle } = await import('./hooks.server');

// --- Helpers ---

function createMockEvent(overrides: {
	url?: string;
	method?: string;
	pathname?: string;
}) {
	const url = overrides.url ?? `http://localhost:5173${overrides.pathname ?? '/dashboard'}`;
	const method = overrides.method ?? 'GET';

	return {
		request: new Request(url, { method }),
		url: new URL(url),
		locals: {} as Record<string, unknown>,
		getClientAddress: () => '127.0.0.1',
		cookies: {
			get: () => undefined,
			set: () => {},
			delete: () => {},
			getAll: () => [],
			serialize: () => ''
		},
		params: {},
		route: { id: '' },
		isDataRequest: false,
		isSubRequest: false,
		platform: undefined,
		fetch: globalThis.fetch
	};
}

function createMockResolve(status = 200, delayMs = 0) {
	return async () => {
		if (delayMs > 0) {
			await new Promise((r) => setTimeout(r, delayMs));
		}
		return new Response('ok', { status, headers: new Headers() });
	};
}

describe('hooks.server.ts — request logging', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should log info for normal successful request', async () => {
		const event = createMockEvent({ pathname: '/dashboard' });
		const resolve = createMockResolve(200);

		await handle({ event: event as never, resolve: resolve as never });

		expect(mockLogger.info).toHaveBeenCalledWith(
			expect.objectContaining({
				method: 'GET',
				path: '/dashboard',
				status: 200,
				durationMs: expect.any(Number)
			}),
			'Request completed'
		);
	});

	it('should log warn for 4xx response', async () => {
		const event = createMockEvent({ pathname: '/not-found' });
		const resolve = createMockResolve(404);

		await handle({ event: event as never, resolve: resolve as never });

		expect(mockLogger.warn).toHaveBeenCalledWith(
			expect.objectContaining({
				method: 'GET',
				path: '/not-found',
				status: 404,
				durationMs: expect.any(Number)
			}),
			'Request completed'
		);
	});

	it('should log error for 5xx response', async () => {
		const event = createMockEvent({ pathname: '/api/broken' });
		const resolve = createMockResolve(500);

		await handle({ event: event as never, resolve: resolve as never });

		expect(mockLogger.error).toHaveBeenCalledWith(
			expect.objectContaining({
				method: 'GET',
				path: '/api/broken',
				status: 500,
				durationMs: expect.any(Number)
			}),
			'Request completed'
		);
	});

	it('should log warn with "slow request" when duration exceeds 1000ms', async () => {
		const event = createMockEvent({ pathname: '/api/slow' });

		// Simulate a slow resolve by manipulating Date.now
		const originalNow = Date.now;
		let callCount = 0;
		vi.spyOn(Date, 'now').mockImplementation(() => {
			callCount++;
			// First call is start, subsequent calls return start + 1500ms
			if (callCount <= 1) return 1000000;
			return 1001500;
		});

		const resolve = createMockResolve(200);
		await handle({ event: event as never, resolve: resolve as never });

		expect(mockLogger.warn).toHaveBeenCalledWith(
			expect.objectContaining({
				method: 'GET',
				path: '/api/slow',
				durationMs: 1500
			}),
			'slow request'
		);

		Date.now = originalNow;
		vi.restoreAllMocks();
	});

	it('should skip logging for /_app/ static asset paths', async () => {
		const event = createMockEvent({ pathname: '/_app/immutable/chunk-abc.js' });
		const resolve = createMockResolve(200);

		await handle({ event: event as never, resolve: resolve as never });

		// Logger should NOT be called with the static asset path
		expect(mockLogger.info).not.toHaveBeenCalledWith(
			expect.objectContaining({ path: '/_app/immutable/chunk-abc.js' }),
			expect.any(String)
		);
	});

	it('should skip logging for /favicon paths', async () => {
		const event = createMockEvent({ pathname: '/favicon.ico' });
		const resolve = createMockResolve(200);

		await handle({ event: event as never, resolve: resolve as never });

		expect(mockLogger.info).not.toHaveBeenCalledWith(
			expect.objectContaining({ path: '/favicon.ico' }),
			expect.any(String)
		);
	});

	it('should skip logging for /robots.txt', async () => {
		const event = createMockEvent({ pathname: '/robots.txt' });
		const resolve = createMockResolve(200);

		await handle({ event: event as never, resolve: resolve as never });

		expect(mockLogger.info).not.toHaveBeenCalledWith(
			expect.objectContaining({ path: '/robots.txt' }),
			expect.any(String)
		);
	});

	it('should skip logging for /health endpoint', async () => {
		const event = createMockEvent({ pathname: '/health' });
		const resolve = createMockResolve(200);

		await handle({ event: event as never, resolve: resolve as never });

		expect(mockLogger.info).not.toHaveBeenCalledWith(
			expect.objectContaining({ path: '/health' }),
			expect.any(String)
		);
	});

	it('should assign a requestId to event.locals', async () => {
		const event = createMockEvent({ pathname: '/dashboard' });
		const resolve = createMockResolve(200);

		await handle({ event: event as never, resolve: resolve as never });

		expect(event.locals.requestId).toBeDefined();
		expect(typeof event.locals.requestId).toBe('string');
		// UUID format check
		expect(event.locals.requestId).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
		);
	});

	it('should include requestId in log metadata', async () => {
		const event = createMockEvent({ pathname: '/api/test' });
		const resolve = createMockResolve(200);

		await handle({ event: event as never, resolve: resolve as never });

		expect(mockLogger.info).toHaveBeenCalledWith(
			expect.objectContaining({
				requestId: expect.stringMatching(
					/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
				)
			}),
			'Request completed'
		);
	});

	it('should log POST method correctly', async () => {
		const event = createMockEvent({ pathname: '/api/data', method: 'POST' });
		const resolve = createMockResolve(201);

		await handle({ event: event as never, resolve: resolve as never });

		expect(mockLogger.info).toHaveBeenCalledWith(
			expect.objectContaining({
				method: 'POST',
				path: '/api/data',
				status: 201
			}),
			'Request completed'
		);
	});

	it('should log error for 503 (5xx boundary)', async () => {
		const event = createMockEvent({ pathname: '/api/unavailable' });
		const resolve = createMockResolve(503);

		await handle({ event: event as never, resolve: resolve as never });

		expect(mockLogger.error).toHaveBeenCalledWith(
			expect.objectContaining({ status: 503 }),
			'Request completed'
		);
	});

	it('should log warn for 400 (4xx boundary)', async () => {
		const event = createMockEvent({ pathname: '/api/bad' });
		const resolve = createMockResolve(400);

		await handle({ event: event as never, resolve: resolve as never });

		expect(mockLogger.warn).toHaveBeenCalledWith(
			expect.objectContaining({ status: 400 }),
			'Request completed'
		);
	});

	it('should log info for 301 redirect', async () => {
		const event = createMockEvent({ pathname: '/old-page' });
		const resolve = createMockResolve(301);

		await handle({ event: event as never, resolve: resolve as never });

		expect(mockLogger.info).toHaveBeenCalledWith(
			expect.objectContaining({ status: 301 }),
			'Request completed'
		);
	});
});

describe('hooks.server.ts — security headers', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should set X-Frame-Options: DENY', async () => {
		const event = createMockEvent({ pathname: '/page' });
		const resolve = createMockResolve(200);

		const response = await handle({ event: event as never, resolve: resolve as never });

		expect(response.headers.get('X-Frame-Options')).toBe('DENY');
	});

	it('should set X-Content-Type-Options: nosniff', async () => {
		const event = createMockEvent({ pathname: '/page' });
		const resolve = createMockResolve(200);

		const response = await handle({ event: event as never, resolve: resolve as never });

		expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
	});

	it('should set Referrer-Policy: strict-origin-when-cross-origin', async () => {
		const event = createMockEvent({ pathname: '/page' });
		const resolve = createMockResolve(200);

		const response = await handle({ event: event as never, resolve: resolve as never });

		expect(response.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
	});

	it('should set X-XSS-Protection: 1; mode=block', async () => {
		const event = createMockEvent({ pathname: '/page' });
		const resolve = createMockResolve(200);

		const response = await handle({ event: event as never, resolve: resolve as never });

		expect(response.headers.get('X-XSS-Protection')).toBe('1; mode=block');
	});

	it('should set all security headers on error responses', async () => {
		const event = createMockEvent({ pathname: '/api/error' });
		const resolve = createMockResolve(500);

		const response = await handle({ event: event as never, resolve: resolve as never });

		expect(response.headers.get('X-Frame-Options')).toBe('DENY');
		expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
		expect(response.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
		expect(response.headers.get('X-XSS-Protection')).toBe('1; mode=block');
	});

	it('should set security headers on static asset paths too', async () => {
		const event = createMockEvent({ pathname: '/_app/immutable/chunk.js' });
		const resolve = createMockResolve(200);

		const response = await handle({ event: event as never, resolve: resolve as never });

		// Security headers should be applied to ALL responses, including static assets
		expect(response.headers.get('X-Frame-Options')).toBe('DENY');
		expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
	});
});
