import { vi, afterEach } from 'vitest';
import { cleanup } from '@testing-library/svelte';

// Polyfill Element.animate for jsdom (used by Svelte transitions)
if (typeof Element.prototype.animate !== 'function') {
	Element.prototype.animate = function () {
		return { finished: Promise.resolve(), cancel: () => {}, onfinish: null } as unknown as Animation;
	};
}

afterEach(() => {
	cleanup();
});

// Mock svelte-sonner
vi.mock('svelte-sonner', () => ({
	toast: {
		success: vi.fn(),
		error: vi.fn(),
		info: vi.fn(),
		warning: vi.fn()
	}
}));

// Mock $app/navigation
vi.mock('$app/navigation', () => ({
	goto: vi.fn(),
	invalidate: vi.fn(),
	invalidateAll: vi.fn()
}));

// Mock api-client
vi.mock('$lib/api-client', () => ({
	apiFetch: vi.fn(),
	apiPost: vi.fn(),
	apiPatch: vi.fn(),
	apiPut: vi.fn(),
	apiDelete: vi.fn(),
	ApiError: class ApiError extends Error {
		constructor(
			public status: number,
			message: string
		) {
			super(message);
		}
	}
}));
