import { vi, afterEach } from 'vitest';
import { cleanup } from '@testing-library/svelte';

// Polyfill Element.animate for jsdom (used by Svelte transitions)
if (typeof Element.prototype.animate !== 'function') {
	Element.prototype.animate = function () {
		return {
			finished: Promise.resolve(),
			cancel: () => {},
			onfinish: null
		} as unknown as Animation;
	};
}

afterEach(async () => {
	cleanup();
	// bits-ui releases its body scroll lock on a 24ms timer after a dialog unmounts. When a test
	// file ends with a dialog open, that timer used to fire after jsdom was gone and vitest reported
	// "ReferenceError: document is not defined" as an unhandled error (and exited with code 1).
	if (document.body.style.pointerEvents === 'none' || document.body.style.overflow === 'hidden') {
		await new Promise((resolve) => setTimeout(resolve, 40));
	}
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
