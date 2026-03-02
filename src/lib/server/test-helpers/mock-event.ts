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
}

export function createMockEvent(opts: MockEventOptions = {}) {
	const { method = 'GET', params = {}, body, user = null, searchParams = {}, formData } = opts;

	const url = new URL('http://localhost:5173/api/test');
	for (const [key, value] of Object.entries(searchParams)) {
		url.searchParams.set(key, value);
	}

	let request: Request;
	if (formData) {
		request = new Request(url, { method, body: formData });
	} else if (body !== undefined) {
		request = new Request(url, {
			method,
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
	} else {
		request = new Request(url, { method });
	}

	const locals: App.Locals = {
		user: user ?? undefined,
		session: user ? ({ id: 'session-1' } as App.Locals['session']) : undefined
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
