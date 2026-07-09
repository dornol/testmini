/**
 * Creates a mock SvelteKit RequestEvent for testing API route handlers.
 */

interface MockEventOptions {
	method?: string;
	params?: Record<string, string>;
	body?: unknown;
	user?: NonNullable<App.Locals['user']> | null;
	searchParams?: Record<string, string>;
	formData?: FormData;
	headers?: HeadersInit;
}

export function createMockEvent(opts: MockEventOptions = {}) {
	const {
		method = 'GET',
		params = {},
		body,
		user = null,
		searchParams = {},
		formData,
		headers
	} = opts;

	const url = new URL('http://localhost:5173/api/test');
	for (const [key, value] of Object.entries(searchParams)) {
		url.searchParams.set(key, value);
	}

	let request: Request;
	const requestHeaders = new Headers(headers);
	if (formData) {
		request = new Request(url, { method, body: formData, headers: requestHeaders });
	} else if (body !== undefined) {
		if (!requestHeaders.has('Content-Type')) {
			requestHeaders.set('Content-Type', 'application/json');
		}
		request = new Request(url, {
			method,
			headers: requestHeaders,
			body: JSON.stringify(body)
		});
	} else {
		request = new Request(url, { method, headers: requestHeaders });
	}

	const locals: App.Locals = {
		user: user ?? undefined,
		session: user ? ({ id: 'session-1' } as App.Locals['session']) : undefined,
		requestId: 'test-request-id'
	};

	return {
		request,
		url,
		params,
		locals,
		cookies: {
			get: () => undefined,
			set: () => {},
			delete: () => {},
			getAll: () => [],
			serialize: () => ''
		},
		getClientAddress: () => '127.0.0.1',
		platform: undefined,
		route: { id: '' },
		isDataRequest: false,
		isSubRequest: false,
		fetch: globalThis.fetch
	} as never;
}
